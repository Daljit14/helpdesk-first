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
          className="glass-pill px-2 py-1 text-xs"
          onClick={() => setOpen(true)}
        >
          Cancel job
        </button>
      ) : (
        <form
          className="flex flex-wrap gap-2"
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
            className="rounded-xl border border-border/70 bg-background/60 px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={pending}
            className="glass-pill px-2 py-1 text-xs"
          >
            {pending ? "Cancelling…" : "Confirm"}
          </button>
          {message && <span className="text-xs">{message}</span>}
        </form>
      )}
    </div>
  );
}
