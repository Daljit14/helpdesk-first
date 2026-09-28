"use client";

import {
  beginAttachmentUpload,
  deleteOwnAttachment,
  finalizeAttachmentUpload,
} from "@/app/actions/attachments";
import { QUARANTINE_BUCKET } from "./constants";
import { createClient } from "@/lib/supabase/client";

export async function uploadSecureAttachment(
  file: File,
  ticketId?: string
): Promise<
  | { error: string }
  | { attachmentId: string; status: "ready" | "scanning" | "rejected" }
> {
  const started = await beginAttachmentUpload({
    fileName: file.name,
    declaredMime: file.type,
    byteSize: file.size,
    ...(ticketId ? { ticketId } : {}),
  });
  if ("error" in started) return started;
  const uploaded = await createClient()
    .storage.from(QUARANTINE_BUCKET)
    .upload(started.quarantinePath, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploaded.error) {
    await deleteOwnAttachment(started.attachmentId);
    return { error: "Upload failed." };
  }
  const finalized = await finalizeAttachmentUpload(started.attachmentId);
  if ("error" in finalized) return finalized;
  const status =
    finalized.status === "ready" ||
    finalized.status === "scanning" ||
    finalized.status === "rejected"
      ? finalized.status
      : "rejected";
  return { attachmentId: started.attachmentId, status };
}
