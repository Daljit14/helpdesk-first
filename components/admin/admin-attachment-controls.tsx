"use client";

import { useState, useTransition } from "react";
import {
  adminDeleteAttachment,
  adminMarkAttachmentSafe,
  adminRejectAttachment,
  adminRescanAttachment,
  adminSetLegalHold,
} from "@/app/actions/admin-attachments";
import type { AttachmentListItem } from "@/components/attachment-list";

export function AdminAttachmentControls({
  attachment,
}: {
  attachment: AttachmentListItem;
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function run(
    operation: () => Promise<{ error: string } | { success: true }>
  ) {
    startTransition(async () => {
      const result = await operation();
      setNotice("error" in result ? result.error : "Saved.");
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      {(attachment.status === "scanning" ||
        attachment.scan_verdict === "unscanned") && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => adminRescanAttachment(attachment.id))}
          className="glass-pill px-2 py-1"
        >
          Re-scan
        </button>
      )}
      {(attachment.status === "scanning" ||
        attachment.scan_verdict === "unscanned") && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              adminMarkAttachmentSafe(
                attachment.id,
                reason || "Reviewed by support."
              )
            )
          }
          className="glass-pill px-2 py-1"
        >
          Mark safe
        </button>
      )}
      {attachment.status !== "deleted" && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              adminRejectAttachment(
                attachment.id,
                reason || "Rejected by support."
              )
            )
          }
          className="glass-pill px-2 py-1"
        >
          Reject
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(() =>
            adminSetLegalHold(attachment.id, attachment.status !== "legal_hold")
          )
        }
        className="glass-pill px-2 py-1"
      >
        {attachment.status === "legal_hold" ? "Clear legal hold" : "Legal hold"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(() =>
            adminDeleteAttachment(
              attachment.id,
              reason || "Deleted by support."
            )
          )
        }
        className="glass-pill px-2 py-1"
      >
        Delete
      </button>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason"
        aria-label={`Reason for ${attachment.original_name}`}
        className="w-28 rounded-full border border-border/60 bg-background/50 px-2 py-1"
      />
      {notice && <span className="sr-only">{notice}</span>}
    </span>
  );
}
