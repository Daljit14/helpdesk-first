import { createClient } from "@/lib/supabase/client";

export const TICKET_ATTACHMENTS_BUCKET = "ticket-attachments";
export const MAX_ATTACHMENT_BYTES = 5_000_000; // 5 MB
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type AttachmentUploadResult =
  { ok: true; path: string } | { ok: false; error: string };

export function buildTicketAttachmentPath(
  userId: string,
  file: Pick<File, "type" | "size">
): string | null {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) return null;
  if (file.size > MAX_ATTACHMENT_BYTES) return null;
  const extension = EXTENSIONS[file.type];
  return `${userId}/${crypto.randomUUID()}.${extension}`;
}

export async function uploadTicketAttachment(
  userId: string,
  file: File
): Promise<AttachmentUploadResult> {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
    return {
      ok: false,
      error: "Only PNG, JPEG, WebP, or PDF files are allowed.",
    };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "File must be 5 MB or smaller." };
  }

  const supabase = createClient();
  const path = buildTicketAttachmentPath(userId, file);
  if (!path) return { ok: false, error: "Could not prepare upload." };

  const { error } = await supabase.storage
    .from(TICKET_ATTACHMENTS_BUCKET)
    .upload(path, file, { upsert: false });

  if (error) return { ok: false, error: "Upload failed. Try again." };
  return { ok: true, path };
}

/**
 * The bucket is private, so viewing an attachment requires a short-lived
 * signed URL. Supabase Storage still enforces the bucket's RLS policy on
 * this call, so a user can only ever get a signed URL for a path under
 * their own folder — even if a ticket somehow referenced someone else's
 * path.
 */
export async function getTicketAttachmentUrl(
  path: string
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(TICKET_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, 3600);

  if (error || !data) return null;
  return data.signedUrl;
}
