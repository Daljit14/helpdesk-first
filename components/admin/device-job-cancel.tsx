"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelDeviceJobAction } from "@/app/actions/admin-devices";

export function DeviceJobCancel({
  jobId,
  canCancel,
}: {
  jobId: string;
  canCancel: boolean;
}) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!canCancel) return null;
  return (
    <div className="mt-2">
      {!open ? (
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-status-danger/40 bg-status-danger/10 px-3 text-xs font-extrabold text-status-danger transition-colors hover:bg-status-danger/20"
          onClick={() => setOpen(true)}
        >
          Cancel job
        </button>
      ) : (
        <form
          className="hf-swap flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await cancelDeviceJobAction({ jobId, reason });
              if ("error" in result)
                setMessage(result.error ?? "Unable to cancel.");
              else {
                setMessage("Cancelled.");
                router.refresh();
              }
            });
          }}
        >
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={300}
            required
            placeholder="Reason"
            className="h-8 min-w-0 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-status-danger px-3 text-xs font-extrabold text-white shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60"
          >
            {pending ? "Cancelling…" : "Confirm"}
          </button>
          {message && (
            <span role="status" className="text-xs font-bold">
              {message}
            </span>
          )}
        </form>
      )}
    </div>
  );
}
