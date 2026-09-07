"use client";

import { useState, type ChangeEvent } from "react";
import { Paperclip, X } from "lucide-react";
import {
  beginAttachmentUpload,
  deleteOwnAttachment,
  finalizeAttachmentUpload,
} from "@/app/actions/attachments";
import { createClient } from "@/lib/supabase/client";

type AttachmentState = {
  id: string;
  name: string;
  status: "Uploading" | "Scanning" | "Ready" | "Rejected" | "Deleted";
  error?: string;
};

const QUARANTINE_BUCKET = "ticket-attachments-quarantine";

export function AttachmentUploader() {
  const [attachments, setAttachments] = useState<AttachmentState[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    const temporaryId = `${file.name}-${crypto.randomUUID()}`;
    setAttachments((current) => [
      ...current,
      { id: temporaryId, name: file.name, status: "Uploading" },
    ]);
    const started = await beginAttachmentUpload({
      fileName: file.name,
      declaredMime: file.type,
      byteSize: file.size,
    });
    if ("error" in started) {
      setAttachments((current) =>
        current.map((item) =>
          item.id === temporaryId
            ? { ...item, status: "Rejected", error: started.error }
            : item
        )
      );
      return;
    }
    setAttachments((current) =>
      current.map((item) =>
        item.id === temporaryId ? { ...item, id: started.attachmentId } : item
      )
    );
    const supabase = createClient();
    const uploaded = await supabase.storage
      .from(QUARANTINE_BUCKET)
      .upload(started.quarantinePath, file, {
        contentType: file.type,
        upsert: false,
      });
    if (uploaded.error) {
      await deleteOwnAttachment(started.attachmentId);
      setAttachments((current) =>
        current.map((item) =>
          item.id === started.attachmentId
            ? { ...item, status: "Rejected", error: "Upload failed." }
            : item
        )
      );
      return;
    }
    setAttachments((current) =>
      current.map((item) =>
        item.id === started.attachmentId
          ? { ...item, status: "Scanning" }
          : item
      )
    );
    const finalized = await finalizeAttachmentUpload(started.attachmentId);
    if ("error" in finalized) {
      setAttachments((current) =>
        current.map((item) =>
          item.id === started.attachmentId
            ? { ...item, status: "Rejected", error: finalized.error }
            : item
        )
      );
      return;
    }
    setAttachments((current) =>
      current.map((item) =>
        item.id === started.attachmentId
          ? {
              ...item,
              status:
                finalized.status === "ready"
                  ? "Ready"
                  : finalized.status === "scanning"
                    ? "Scanning"
                    : "Rejected",
              error:
                finalized.status === "ready" || finalized.status === "scanning"
                  ? undefined
                  : "Security scan failed.",
            }
          : item
      )
    );
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void Promise.all(files.map(upload));
  }

  async function remove(id: string) {
    const result = await deleteOwnAttachment(id);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setAttachments((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: "Deleted" } : item
      )
    );
  }

  return (
    <div className="glass-strong space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="glass-pill inline-flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
          <Paperclip className="h-4 w-4" />
          Attach images or PDFs
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={handleFiles}
            className="hidden"
          />
        </label>
        <span className="text-xs text-muted-foreground">
          Up to 10 files · 20 MB each
        </span>
      </div>
      {attachments.length > 0 && (
        <ul className="space-y-2 text-sm">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-2"
            >
              <span className="min-w-0 truncate">{attachment.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={
                    attachment.status === "Rejected"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }
                >
                  {attachment.status}
                  {attachment.error ? ` (${attachment.error})` : ""}
                </span>
                {attachment.status === "Ready" && (
                  <>
                    <input
                      type="hidden"
                      name="attachmentIds[]"
                      value={attachment.id}
                    />
                    <button
                      type="button"
                      onClick={() => void remove(attachment.id)}
                      aria-label={`Remove ${attachment.name}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
