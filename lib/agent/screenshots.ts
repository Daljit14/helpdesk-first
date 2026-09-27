import { PRIVATE_BUCKET } from "@/lib/attachments/constants";
import { writeAttachmentEvent } from "@/app/actions/attachments";
import { guardModelInput } from "@/lib/autonomy/guardrails/input";
import { sanitizeForUser, wrapUntrusted } from "./untrusted";
import type { AgentSession } from "./types";
import type { ScreenshotTranscriber } from "./model";

type Admin = ReturnType<
  typeof import("@/lib/supabase/admin").createAdminClient
>;

export type ScreenshotIntake = {
  attachmentId: string;
  modelText: string;
  userSummary: string;
  sha256: string;
};

type RejectionCode =
  | "not_found"
  | "not_ready"
  | "not_image"
  | "too_large"
  | "foreign"
  | "expired"
  | "transcribe_failed";

export type ScreenshotIntakeResult =
  | { ok: true; items: ScreenshotIntake[] }
  | { ok: false; code: RejectionCode; message: string; injection?: boolean };

type AttachmentRow = {
  id: string;
  organization_id: string | null;
  ticket_id: string | null;
  uploader_id: string;
  status: string;
  detected_mime: string | null;
  byte_size: number;
  sha256: string | null;
  storage_path: string | null;
  scan_verdict: string | null;
  expires_at: string | null;
  deleted_at: string | null;
};

function screenshotRetentionDays(): number {
  const configured = Number(
    process.env.HELP_DESK_REQUESTER_AGENT_SCREENSHOT_RETENTION_DAYS ?? "30"
  );
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, 3650)
    : 30;
}

function screenshotMaxBytes(): number {
  const configured = Number(
    process.env.HELP_DESK_REQUESTER_AGENT_SCREENSHOT_MAX_BYTES ?? "5242880"
  );
  return Number.isFinite(configured) && configured > 0
    ? Math.min(configured, 20 * 1024 * 1024)
    : 5 * 1024 * 1024;
}

function scannerConfigured(): boolean {
  return process.env.HELP_DESK_ATTACHMENT_SCANNER === "virustotal";
}

function reject(code: RejectionCode, message: string): ScreenshotIntakeResult {
  return { ok: false, code, message };
}

export async function intakeScreenshots(
  admin: Admin,
  session: AgentSession,
  attachmentIds: string[],
  deps: {
    transcribe: ScreenshotTranscriber;
    signal: AbortSignal;
  }
): Promise<ScreenshotIntakeResult> {
  const items: ScreenshotIntake[] = [];
  for (const attachmentId of attachmentIds) {
    const result = await admin
      .from("ticket_attachments")
      .select(
        "id,organization_id,ticket_id,uploader_id,status,detected_mime,byte_size,sha256,storage_path,scan_verdict,expires_at,deleted_at"
      )
      .eq("id", attachmentId)
      .maybeSingle();
    if (result.error || !result.data)
      return reject("not_found", "Screenshot not found.");
    const row = result.data as AttachmentRow;
    if (
      row.uploader_id !== session.requester_id ||
      row.organization_id !== session.organization_id
    )
      return reject(
        "foreign",
        "That screenshot is not available to this session."
      );
    if (
      row.status !== "ready" ||
      row.deleted_at ||
      !["clean", "unscanned"].includes(row.scan_verdict ?? "") ||
      (row.scan_verdict === "unscanned" && scannerConfigured())
    )
      return reject("not_ready", "That screenshot is not ready for analysis.");
    if (
      !row.detected_mime?.startsWith("image/") ||
      !["image/png", "image/jpeg", "image/webp"].includes(row.detected_mime)
    )
      return reject(
        "not_image",
        "Only PNG, JPEG, and WebP screenshots are supported."
      );
    if (row.byte_size > screenshotMaxBytes())
      return reject("too_large", "That screenshot is too large to analyze.");
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())
      return reject("expired", "That screenshot has expired.");
    if (row.ticket_id && row.ticket_id !== session.escalation_ticket_id)
      return reject(
        "foreign",
        "That screenshot is attached to another ticket."
      );
    if (!row.storage_path || !row.sha256)
      return reject(
        "not_ready",
        "That screenshot is missing secure storage metadata."
      );

    const downloaded = await admin.storage
      .from(PRIVATE_BUCKET)
      .download(row.storage_path);
    if (downloaded.error || !downloaded.data)
      return reject("not_found", "Unable to read that screenshot.");
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    if (bytes.byteLength > screenshotMaxBytes())
      return reject("too_large", "That screenshot is too large to analyze.");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const downloadedHash = Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0")
    ).join("");
    if (downloadedHash !== row.sha256)
      return reject("not_ready", "That screenshot failed integrity checks.");
    const nextExpiry = new Date(
      Date.now() + screenshotRetentionDays() * 24 * 60 * 60_000
    );
    const existingExpiry = row.expires_at
      ? new Date(row.expires_at)
      : nextExpiry;
    const expiresAt =
      existingExpiry.getTime() < nextExpiry.getTime()
        ? existingExpiry.toISOString()
        : nextExpiry.toISOString();
    await admin
      .from("ticket_attachments")
      .update({ expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    await writeAttachmentEvent(row, "viewed", "ai", session.requester_id, {
      purpose: "requester_agent",
    });
    try {
      const transcription = await deps.transcribe.transcribe({
        bytes,
        mime: row.detected_mime,
        signal: deps.signal,
      });
      const guarded = guardModelInput([
        { source: "attachment.text", text: transcription.text },
      ]);
      if (guarded.blocked) {
        return {
          ok: false,
          code: "transcribe_failed",
          message: "The screenshot transcription was blocked for safety.",
          injection: true,
        };
      }
      const text = guarded.fields[0]?.text ?? "";
      items.push({
        attachmentId: row.id,
        modelText: wrapUntrusted("screenshot", {
          attachmentId: row.id,
          text,
        }),
        userSummary: sanitizeForUser(text).slice(0, 200),
        sha256: row.sha256,
      });
    } catch {
      return reject(
        "transcribe_failed",
        "The screenshot could not be analyzed."
      );
    }
  }
  return { ok: true, items };
}
