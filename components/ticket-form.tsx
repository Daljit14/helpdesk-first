"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { Paperclip, X } from "lucide-react";
import { submitTicket, type TicketActionState } from "@/app/actions/guides";
import { Button } from "@/components/ui/button";
import {
  uploadTicketAttachment,
  ALLOWED_ATTACHMENT_TYPES,
} from "@/lib/supabase/storage";

const initialState: TicketActionState = null;

export function TicketForm({
  issueId,
  userId,
  workflowEnabled = false,
}: {
  issueId: string;
  userId: string;
  workflowEnabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    submitTicket,
    initialState
  );
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (state?.success) {
    return (
      <p className="glass rounded-2xl border-emerald-500/30 p-4 text-sm text-emerald-700 dark:text-emerald-300">
        Your ticket was submitted. IT will follow up soon.
      </p>
    );
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const result = await uploadTicketAttachment(userId, file);
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error);
      setAttachmentPath(null);
      setFileName(null);
      return;
    }
    setAttachmentPath(result.path);
    setFileName(file.name);
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="issueId" value={issueId} />
      {workflowEnabled && (
        <>
          <input type="hidden" name="workflowEnabled" value="true" />
          <input type="hidden" name="platform" value="Other" />
        </>
      )}
      {attachmentPath && (
        <input type="hidden" name="attachmentPath" value={attachmentPath} />
      )}
      <div>
        <label htmlFor="ticket-message" className="font-medium">
          What do you need help with?
        </label>
        <textarea
          id="ticket-message"
          name="message"
          rows={5}
          required
          maxLength={2000}
          className="mt-2 w-full rounded-2xl border border-border/70 bg-background/60 p-3 text-foreground backdrop-blur outline-none focus:ring-2 focus:ring-ring"
        />
        {state?.fieldErrors?.message && (
          <p className="mt-1 text-sm text-destructive">
            {state.fieldErrors.message}
          </p>
        )}
      </div>
      <div>
        <label className="glass-pill flex w-fit cursor-pointer items-center gap-2 border-dashed px-3 py-2 text-sm text-muted-foreground hover:border-foreground/40">
          <Paperclip className="h-4 w-4" />
          {fileName ? "Change screenshot" : "Attach a screenshot (optional)"}
          <input
            type="file"
            accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
        {uploading && (
          <p className="mt-1 text-sm text-muted-foreground">Uploading…</p>
        )}
        {fileName && !uploading && (
          <p className="mt-1 flex items-center gap-2 text-sm">
            {fileName}
            <button
              type="button"
              onClick={() => {
                setAttachmentPath(null);
                setFileName(null);
              }}
              aria-label="Remove attachment"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </p>
        )}
        {uploadError && (
          <p className="mt-1 text-sm text-destructive">{uploadError}</p>
        )}
      </div>
      <p className="text-sm text-amber-700 dark:text-amber-300">
        Do not include passwords, security codes or personal information
      </p>
      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <Button type="submit" disabled={pending || uploading}>
        {pending ? "Submitting…" : "Submit ticket"}
      </Button>
    </form>
  );
}
