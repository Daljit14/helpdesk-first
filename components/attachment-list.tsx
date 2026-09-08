"use client";

import { useState, useTransition } from "react";
import { ExternalLink, FileText, ImageIcon } from "lucide-react";
import { getAttachmentAccessUrl } from "@/app/actions/attachments";

export type AttachmentListItem = {
  id: string;
  original_name: string;
  byte_size: number;
  status: string;
  detected_mime: string | null;
  scan_verdict: string | null;
  created_at: string;
  rejection_reason?: string | null;
  width?: number | null;
  height?: number | null;
  page_count?: number | null;
};

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(item: AttachmentListItem): string {
  if (item.status === "rejected")
    return `Rejected${item.rejection_reason ? ` (${item.rejection_reason})` : ""}`;
  if (item.scan_verdict === "unscanned") return "Not virus-scanned";
  return item.status[0]?.toUpperCase() + item.status.slice(1);
}

export function AttachmentList({
  attachments,
  adminControls,
}: {
  attachments: AttachmentListItem[];
  adminControls?: Record<string, React.ReactNode>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (attachments.length === 0) return null;

  function openAttachment(id: string) {
    setPendingId(id);
    setError(null);
    startTransition(async () => {
      const result = await getAttachmentAccessUrl(id);
      setPendingId(null);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="glass-strong mt-6 p-5">
      <h2 className="font-semibold">Attachments</h2>
      <ul className="mt-3 space-y-2">
        {attachments.map((attachment) => {
          const image = attachment.detected_mime?.startsWith("image/");
          return (
            <li
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                {image ? (
                  <ImageIcon className="h-4 w-4 shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0" />
                )}
                <span className="min-w-0 truncate">
                  {attachment.original_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {sizeLabel(attachment.byte_size)}
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs">
                <span
                  className={
                    attachment.status === "rejected"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }
                >
                  {statusLabel(attachment)}
                </span>
                {attachment.status === "ready" && (
                  <button
                    type="button"
                    onClick={() => openAttachment(attachment.id)}
                    disabled={pendingId === attachment.id}
                    className="glass-pill inline-flex items-center gap-1 px-3 py-1.5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {pendingId === attachment.id ? "Opening…" : "Open"}
                  </button>
                )}
                {adminControls?.[attachment.id]}
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
