"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { isSecureAttachmentsEnabled } from "@/lib/admin/flags";

const policySchema = z.object({
  maxFilesPerTicket: z.number().int().min(1).max(50),
  maxFileBytes: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024),
  maxTotalBytes: z
    .number()
    .int()
    .positive()
    .max(1024 * 1024 * 1024),
  retentionDays: z.number().int().min(1).max(3650),
  allowedMimeTypes: z.array(z.string()).min(1),
});

type Result = { error: string } | { success: true };

async function adminForAttachment(attachmentId: string): Promise<
  | { error: string }
  | {
      session: NonNullable<Awaited<ReturnType<typeof getAdminSession>>>;
      row: {
        id: string;
        organization_id: string | null;
        status: string;
        storage_path: string | null;
        quarantine_path: string | null;
        legal_hold: boolean;
      };
    }
> {
  if (!isSecureAttachmentsEnabled()) return { error: "Not available." };
  const session = await getAdminSession();
  if (!session) return { error: "Not authorized." };
  const { data: row } = await createAdminClient()
    .from("ticket_attachments")
    .select("id,organization_id,status,storage_path,quarantine_path,legal_hold")
    .eq("id", attachmentId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!row) return { error: "Attachment not found." };
  return { session, row };
}

export async function adminRescanAttachment(
  attachmentId: string
): Promise<Result> {
  const found = await adminForAttachment(attachmentId);
  if ("error" in found) return found;
  if (!["scanning", "unscanned"].includes(found.row.status)) {
    return { error: "Only scanning attachments can be rescanned." };
  }
  await createAdminClient()
    .from("ticket_attachments")
    .update({
      status: "scanning",
      scan_verdict: null,
      scan_detail: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attachmentId);
  await recordAudit(found.session, "attachment.rescan", attachmentId);
  return { success: true };
}

export async function adminMarkAttachmentSafe(
  attachmentId: string,
  reason: string
): Promise<Result> {
  const found = await adminForAttachment(attachmentId);
  if ("error" in found) return found;
  if (!["scanning", "unscanned"].includes(found.row.status)) {
    return {
      error: "Only scanning or unscanned attachments can be marked safe.",
    };
  }
  if (!found.row.storage_path) {
    return { error: "Attachment has not reached private storage." };
  }
  const admin = createAdminClient();
  await admin
    .from("ticket_attachments")
    .update({
      status: "ready",
      scan_verdict: "clean",
      scan_engine: "admin",
      scan_detail: reason.trim().slice(0, 500),
      scanned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", attachmentId);
  await admin.from("attachment_events").insert({
    attachment_id: attachmentId,
    organization_id: found.row.organization_id,
    actor_id: found.session.userId,
    actor_type: "employee",
    event_type: "ready",
    detail: { reason: reason.trim().slice(0, 500), manuallyApproved: true },
  });
  await recordAudit(found.session, "attachment.mark_safe", attachmentId);
  return { success: true };
}

export async function adminRejectAttachment(
  attachmentId: string,
  reason: string
): Promise<Result> {
  const found = await adminForAttachment(attachmentId);
  if ("error" in found) return found;
  const admin = createAdminClient();
  await admin
    .from("ticket_attachments")
    .update({
      status: "rejected",
      rejection_reason: reason.trim().slice(0, 500) || "Rejected by support.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", attachmentId);
  await admin.from("attachment_events").insert({
    attachment_id: attachmentId,
    organization_id: found.row.organization_id,
    actor_id: found.session.userId,
    actor_type: "employee",
    event_type: "rejected",
    detail: { reason: reason.trim().slice(0, 500) },
  });
  if (found.row.storage_path)
    await admin.storage
      .from("ticket-attachments-private")
      .remove([found.row.storage_path]);
  if (found.row.quarantine_path)
    await admin.storage
      .from("ticket-attachments-quarantine")
      .remove([found.row.quarantine_path]);
  await recordAudit(found.session, "attachment.reject", attachmentId);
  return { success: true };
}

export async function adminDeleteAttachment(
  attachmentId: string,
  reason: string
): Promise<Result> {
  const result = await adminRejectAttachment(attachmentId, reason);
  if ("error" in result) return result;
  const found = await adminForAttachment(attachmentId);
  if ("error" in found) return found;
  await createAdminClient()
    .from("ticket_attachments")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      deleted_by: found.session.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attachmentId);
  await recordAudit(found.session, "attachment.delete", attachmentId);
  return { success: true };
}

export async function adminSetLegalHold(
  attachmentId: string,
  legalHold: boolean
): Promise<Result> {
  const found = await adminForAttachment(attachmentId);
  if ("error" in found) return found;
  const admin = createAdminClient();
  await admin
    .from("ticket_attachments")
    .update({
      legal_hold: legalHold,
      status: legalHold ? "legal_hold" : "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", attachmentId);
  await admin.from("attachment_events").insert({
    attachment_id: attachmentId,
    organization_id: found.row.organization_id,
    actor_id: found.session.userId,
    actor_type: "employee",
    event_type: legalHold ? "legal_hold_set" : "legal_hold_cleared",
  });
  await recordAudit(
    found.session,
    legalHold ? "attachment.legal_hold_set" : "attachment.legal_hold_cleared",
    attachmentId
  );
  return { success: true };
}

export async function adminUpdateAttachmentPolicy(
  organizationId: string,
  input: unknown
): Promise<Result> {
  if (!isSecureAttachmentsEnabled()) return { error: "Not available." };
  const session = await getAdminSession();
  if (
    !session ||
    session.organizationId !== organizationId ||
    session.role !== "admin"
  ) {
    return { error: "Not authorized." };
  }
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid attachment policy." };
  const { error } = await createAdminClient()
    .from("attachment_policies")
    .upsert({
      organization_id: organizationId,
      max_files_per_ticket: parsed.data.maxFilesPerTicket,
      max_file_bytes: parsed.data.maxFileBytes,
      max_total_bytes: parsed.data.maxTotalBytes,
      allowed_mime_types: parsed.data.allowedMimeTypes,
      retention_days: parsed.data.retentionDays,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: "Unable to update attachment policy." };
  await recordAudit(session, "attachment.policy_update", organizationId);
  return { success: true };
}

export async function listAdminAttachments(
  ticketId: string,
  organizationId: string
) {
  const session = await getAdminSession();
  if (
    !session ||
    session.organizationId !== organizationId ||
    !isSecureAttachmentsEnabled()
  )
    return [];
  const { data } = await createAdminClient()
    .from("ticket_attachments")
    .select(
      "id,original_name,byte_size,status,detected_mime,scan_verdict,created_at,rejection_reason,width,height,page_count,storage_path,quarantine_path"
    )
    .eq("ticket_id", ticketId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  return data ?? [];
}
