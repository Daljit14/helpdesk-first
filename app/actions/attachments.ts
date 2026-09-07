"use server";

import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { isSecureAttachmentsEnabled } from "@/lib/admin/flags";
import { MemoryRateLimiter } from "@/lib/ai/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/user";
import { getAttachmentPolicy } from "@/lib/attachments/policy";
import {
  inspectPdf,
  sanitizeFilename,
  sniffMime,
} from "@/lib/attachments/inspect";
import { createScanner } from "@/lib/attachments/scanner";

const QUARANTINE_BUCKET = "ticket-attachments-quarantine";
const PRIVATE_BUCKET = "ticket-attachments-private";
const attachmentLimiter = new MemoryRateLimiter({
  windowMs: 10 * 60_000,
  maxRequests: 30,
});

const beginSchema = z.object({
  fileName: z.string().trim().min(1).max(512),
  declaredMime: z.string().trim().min(1),
  byteSize: z.number().int().positive(),
  ticketId: z.string().uuid().optional(),
});

const attachmentIdSchema = z.string().uuid();

type AttachmentRow = {
  id: string;
  organization_id: string | null;
  ticket_id: string | null;
  uploader_id: string;
  status: string;
  original_name: string;
  detected_mime: string | null;
  declared_mime: string | null;
  byte_size: number;
  sha256: string | null;
  width: number | null;
  height: number | null;
  page_count: number | null;
  quarantine_path: string | null;
  storage_path: string | null;
  scan_engine: string | null;
  scan_verdict: string | null;
  scan_detail: string | null;
  scanned_at: string | null;
  rejection_reason: string | null;
  legal_hold: boolean;
  expires_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

function resultError(error: string) {
  return { error };
}

function extensionForMime(mime: string): string | null {
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  return extensions[mime] ?? null;
}

async function authorized(action: string) {
  if (!isSecureAttachmentsEnabled()) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const check = await attachmentLimiter.check(
    `attachment:${action}:${user.id}`
  );
  return check.allowed ? user : null;
}

async function organizationForUser(userId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

async function writeAttachmentEvent(
  attachment: Pick<AttachmentRow, "id" | "organization_id">,
  eventType:
    | "uploaded"
    | "scan_started"
    | "scan_completed"
    | "ready"
    | "rejected"
    | "viewed"
    | "downloaded"
    | "deleted"
    | "legal_hold_set"
    | "legal_hold_cleared"
    | "retention_purged",
  actorType: "user" | "employee" | "system" | "ai",
  actorId: string | null,
  detail: Record<string, unknown> = {}
) {
  await createAdminClient().from("attachment_events").insert({
    attachment_id: attachment.id,
    organization_id: attachment.organization_id,
    actor_id: actorId,
    actor_type: actorType,
    event_type: eventType,
    detail,
  });
}

async function deleteQuarantine(path: string | null) {
  if (!path) return;
  await createAdminClient().storage.from(QUARANTINE_BUCKET).remove([path]);
}

async function rejectAttachment(
  row: AttachmentRow,
  reason: string,
  detail?: Record<string, unknown>,
  scan?: { engine?: string; verdict?: string }
) {
  const admin = createAdminClient();
  await admin
    .from("ticket_attachments")
    .update({
      status: "rejected",
      rejection_reason: reason,
      scan_engine: scan?.engine ?? row.scan_engine,
      scan_verdict: scan?.verdict ?? row.scan_verdict,
      scan_detail: detail ? JSON.stringify(detail) : row.scan_detail,
      scanned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  await writeAttachmentEvent(row, "rejected", "system", null, {
    reason,
    ...detail,
  });
  await deleteQuarantine(row.quarantine_path);
}

export async function beginAttachmentUpload(
  input: unknown
): Promise<
  { error: string } | { attachmentId: string; quarantinePath: string }
> {
  const user = await authorized("begin");
  if (!user) return resultError("Secure attachments are not available.");
  const parsed = beginSchema.safeParse(input);
  if (!parsed.success) return resultError("Invalid attachment details.");

  const declaredExtension = extensionForMime(parsed.data.declaredMime);
  if (!declaredExtension)
    return resultError("This file type is not supported.");

  const admin = createAdminClient();
  let organizationId = await organizationForUser(user.id);
  if (parsed.data.ticketId) {
    const { data: ticket } = await admin
      .from("tickets")
      .select("id,organization_id,user_id")
      .eq("id", parsed.data.ticketId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!ticket) return resultError("Ticket not found.");
    organizationId = ticket.organization_id ?? organizationId;
  }
  const policy = await getAttachmentPolicy(organizationId);
  if (!policy.allowedMimeTypes.includes(parsed.data.declaredMime)) {
    return resultError("This file type is not allowed.");
  }
  if (parsed.data.byteSize > policy.maxFileBytes) {
    return resultError("This file is larger than the organization limit.");
  }

  const { data: existing } = await admin
    .from("ticket_attachments")
    .select("ticket_id,status,byte_size,created_at")
    .eq("uploader_id", user.id)
    .in("status", ["uploading", "scanning", "ready"]);
  const recentUnattachedCutoff = Date.now() - 60 * 60_000;
  const relevant = (existing ?? []).filter((row) => {
    if (parsed.data.ticketId) return row.ticket_id === parsed.data.ticketId;
    return (
      !row.ticket_id &&
      new Date(row.created_at).getTime() >= recentUnattachedCutoff
    );
  });
  if (relevant.length >= policy.maxFilesPerTicket) {
    return resultError(
      "The attachment limit for this ticket has been reached."
    );
  }
  const totalBytes = relevant.reduce(
    (total, row) => total + Number(row.byte_size),
    parsed.data.byteSize
  );
  if (totalBytes > policy.maxTotalBytes) {
    return resultError("The total attachment size limit has been reached.");
  }

  const attachmentId = randomUUID();
  const quarantinePath = `${user.id}/${attachmentId}.${declaredExtension}`;
  const { error } = await admin.from("ticket_attachments").insert({
    id: attachmentId,
    organization_id: organizationId,
    ticket_id: parsed.data.ticketId ?? null,
    uploader_id: user.id,
    status: "uploading",
    original_name: sanitizeFilename(parsed.data.fileName),
    declared_mime: parsed.data.declaredMime,
    byte_size: parsed.data.byteSize,
    quarantine_path: quarantinePath,
  });
  if (error) return resultError("Unable to prepare attachment upload.");
  return { attachmentId, quarantinePath };
}

async function loadOwnAttachment(
  userId: string,
  attachmentId: string
): Promise<AttachmentRow | null> {
  const { data } = await createAdminClient()
    .from("ticket_attachments")
    .select(
      "id,organization_id,ticket_id,uploader_id,status,original_name,detected_mime,declared_mime,byte_size,sha256,width,height,page_count,quarantine_path,storage_path,scan_engine,scan_verdict,scan_detail,scanned_at,rejection_reason,legal_hold,expires_at,deleted_at,created_at"
    )
    .eq("id", attachmentId)
    .eq("uploader_id", userId)
    .maybeSingle();
  return (data as AttachmentRow | null) ?? null;
}

export async function finalizeAttachmentUpload(
  attachmentId: string
): Promise<{ error: string } | { status: string }> {
  const user = await authorized("finalize");
  if (!user) return resultError("Secure attachments are not available.");
  if (!attachmentIdSchema.safeParse(attachmentId).success)
    return resultError("Invalid attachment.");
  const row = await loadOwnAttachment(user.id, attachmentId);
  if (!row || !row.quarantine_path) return resultError("Attachment not found.");
  if (row.status !== "uploading" && row.status !== "scanning") {
    return { status: row.status };
  }

  const admin = createAdminClient();
  const policy = await getAttachmentPolicy(row.organization_id);
  await admin
    .from("ticket_attachments")
    .update({ status: "scanning", updated_at: new Date().toISOString() })
    .eq("id", row.id);
  await writeAttachmentEvent(row, "uploaded", "user", user.id);
  await writeAttachmentEvent(row, "scan_started", "system", null);

  let bytes: Uint8Array;
  try {
    const downloaded = await admin.storage
      .from(QUARANTINE_BUCKET)
      .download(row.quarantine_path);
    if (downloaded.error || !downloaded.data) {
      await rejectAttachment(row, "Unable to read uploaded file.");
      return resultError("Unable to read uploaded file.");
    }
    bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  } catch {
    await rejectAttachment(row, "Unable to read uploaded file.");
    return resultError("Unable to read uploaded file.");
  }

  if (
    bytes.byteLength !== row.byte_size ||
    bytes.byteLength > policy.maxFileBytes
  ) {
    await rejectAttachment(row, "File size validation failed.");
    return resultError("File size validation failed.");
  }
  const detectedMime = sniffMime(bytes);
  if (
    !detectedMime ||
    detectedMime !== row.declared_mime ||
    !policy.allowedMimeTypes.includes(detectedMime)
  ) {
    await rejectAttachment(
      row,
      "File content does not match its declared type."
    );
    return resultError("File content does not match its declared type.");
  }

  let sanitized = bytes;
  let width: number | null = null;
  let height: number | null = null;
  let pageCount: number | null = null;
  if (detectedMime === "application/pdf") {
    const inspected = inspectPdf(bytes);
    pageCount = inspected.pageCount;
    if (!inspected.ok) {
      await rejectAttachment(row, inspected.reason ?? "PDF validation failed.");
      return resultError(inspected.reason ?? "PDF validation failed.");
    }
  } else {
    try {
      const image = sharp(bytes);
      const metadata = await image.metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
      if ((width ?? 0) > 8000 || (height ?? 0) > 8000) {
        await rejectAttachment(
          row,
          "Image dimensions exceed the 8000px limit."
        );
        return resultError("Image dimensions exceed the 8000px limit.");
      }
      const format =
        detectedMime === "image/png"
          ? "png"
          : detectedMime === "image/webp"
            ? "webp"
            : "jpeg";
      sanitized = await image.rotate().toFormat(format).toBuffer();
    } catch {
      await rejectAttachment(row, "Image validation failed.");
      return resultError("Image validation failed.");
    }
  }

  const sha256 = createHash("sha256").update(sanitized).digest("hex");
  const scan = await createScanner().scan(sanitized, {
    sha256,
    mime: detectedMime,
  });
  await writeAttachmentEvent(row, "scan_completed", "system", null, {
    engine: scan.engine,
    verdict: scan.verdict,
  });
  if (scan.verdict === "infected" || scan.verdict === "suspicious") {
    await rejectAttachment(
      row,
      "Security scan failed",
      { verdict: scan.verdict },
      scan
    );
    return { status: "rejected" };
  }
  if (scan.verdict === "error") {
    await admin
      .from("ticket_attachments")
      .update({
        status: "scanning",
        detected_mime: detectedMime,
        sha256,
        width,
        height,
        page_count: pageCount,
        scan_engine: scan.engine,
        scan_verdict: scan.verdict,
        scan_detail: scan.detail ?? null,
        scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return { status: "scanning" };
  }

  const storagePath = row.quarantine_path;
  const uploaded = await admin.storage
    .from(PRIVATE_BUCKET)
    .upload(storagePath, sanitized, {
      contentType: detectedMime,
      upsert: false,
    });
  if (uploaded.error) {
    await rejectAttachment(row, "Unable to store sanitized attachment.");
    return resultError("Unable to store sanitized attachment.");
  }

  const expiresAt = new Date(
    Date.now() + policy.retentionDays * 24 * 60 * 60_000
  ).toISOString();
  const { error } = await admin
    .from("ticket_attachments")
    .update({
      status: "ready",
      detected_mime: detectedMime,
      sha256,
      width,
      height,
      page_count: pageCount,
      storage_path: storagePath,
      scan_engine: scan.engine,
      scan_verdict: scan.verdict,
      scan_detail: scan.detail ?? null,
      scanned_at: new Date().toISOString(),
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) {
    await admin.storage.from(PRIVATE_BUCKET).remove([storagePath]);
    await rejectAttachment(row, "Unable to finalize attachment.");
    return resultError("Unable to finalize attachment.");
  }
  await deleteQuarantine(row.quarantine_path);
  await writeAttachmentEvent(row, "ready", "system", null, {
    scanVerdict: scan.verdict,
  });
  return { status: "ready" };
}

export async function attachTicketAttachments(
  ticketId: string,
  attachmentIds: string[]
): Promise<{ error: string } | { success: true }> {
  if (!isSecureAttachmentsEnabled()) return { success: true };
  const user = await getCurrentUser();
  if (!user) return resultError("Not authorized.");
  const ids = [...new Set(attachmentIds)].filter(
    (id) => attachmentIdSchema.safeParse(id).success
  );
  if (ids.length === 0) return { success: true };
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select("id,organization_id,user_id")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ticket) return resultError("Ticket not found.");
  const policy = await getAttachmentPolicy(ticket.organization_id);
  const { data: existing } = await admin
    .from("ticket_attachments")
    .select("id")
    .eq("ticket_id", ticketId)
    .in("status", ["uploading", "scanning", "ready"]);
  if ((existing?.length ?? 0) + ids.length > policy.maxFilesPerTicket)
    return resultError("Too many attachments.");
  const { data: attached, error } = await admin
    .from("ticket_attachments")
    .update({
      ticket_id: ticketId,
      organization_id: ticket.organization_id,
      updated_at: new Date().toISOString(),
    })
    .eq("uploader_id", user.id)
    .is("ticket_id", null)
    .eq("status", "ready")
    .in("id", ids)
    .select("id");
  if (error || attached?.length !== ids.length)
    return resultError("Only ready attachments can be attached.");
  return { success: true };
}

export async function deleteOwnAttachment(
  attachmentId: string
): Promise<{ error: string } | { success: true }> {
  const user = await authorized("delete");
  if (!user) return resultError("Secure attachments are not available.");
  const row = await loadOwnAttachment(user.id, attachmentId);
  if (!row) return resultError("Attachment not found.");
  if (row.ticket_id) {
    const { data: ticket } = await createAdminClient()
      .from("tickets")
      .select("status")
      .eq("id", row.ticket_id)
      .maybeSingle();
    if (["resolved", "closed"].includes(String(ticket?.status).toLowerCase())) {
      return resultError("Resolved tickets cannot remove attachments.");
    }
  }
  const admin = createAdminClient();
  await admin
    .from("ticket_attachments")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (row.storage_path)
    await admin.storage.from(PRIVATE_BUCKET).remove([row.storage_path]);
  await deleteQuarantine(row.quarantine_path);
  await writeAttachmentEvent(row, "deleted", "user", user.id);
  return { success: true };
}

export async function getAttachmentAccessUrl(
  attachmentId: string
): Promise<{ error: string } | { url: string }> {
  const user = await getCurrentUser();
  if (!user) return resultError("Not authorized.");
  if (!isSecureAttachmentsEnabled()) return resultError("Not available.");
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("ticket_attachments")
    .select(
      "id,organization_id,ticket_id,uploader_id,status,storage_path,scan_verdict"
    )
    .eq("id", attachmentId)
    .maybeSingle();
  if (!row || row.status !== "ready" || !row.storage_path) {
    return resultError("Attachment is not available.");
  }
  let allowed = row.uploader_id === user.id;
  let actorType: "user" | "employee" = "user";
  if (!allowed) {
    const session = await getAdminSession();
    allowed = Boolean(
      session &&
      row.organization_id &&
      session.organizationId === row.organization_id
    );
    if (allowed) actorType = "employee";
  }
  if (!allowed) return resultError("Attachment is not available.");
  const signed = await admin.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(row.storage_path, 60);
  if (signed.error || !signed.data?.signedUrl)
    return resultError("Unable to open attachment.");
  await writeAttachmentEvent(
    row as Pick<AttachmentRow, "id" | "organization_id">,
    "viewed",
    actorType,
    user.id
  );
  return { url: signed.data.signedUrl };
}

export async function listOwnAttachments(ticketId: string) {
  const user = await getCurrentUser();
  if (!user || !isSecureAttachmentsEnabled()) return [];
  const { data } = await createAdminClient()
    .from("ticket_attachments")
    .select(
      "id,original_name,byte_size,status,detected_mime,scan_verdict,created_at,width,height,page_count,rejection_reason"
    )
    .eq("ticket_id", ticketId)
    .eq("uploader_id", user.id)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function purgeExpiredAttachments(): Promise<{
  deleted: number;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("purge_expired_attachments");
  if (error) throw error;
  const rows = (data ?? []) as { storage_path: string | null }[];
  const paths = rows
    .map((row) => row.storage_path)
    .filter((path): path is string => Boolean(path));
  if (paths.length) await admin.storage.from(PRIVATE_BUCKET).remove(paths);
  return { deleted: rows.length };
}
