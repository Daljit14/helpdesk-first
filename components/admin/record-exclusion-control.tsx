"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { excludeRecordAction } from "@/app/actions/record-exclusions";

export function RecordExclusionControl({
  table,
  recordId,
  canExclude,
  excluded,
}: {
  table: "tickets" | "resolution_runs";
  recordId: string;
  canExclude: boolean;
  excluded: boolean;
}) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (excluded)
    return (
      <span className="rounded-full border px-2 py-1 text-xs">
        Excluded (test data)
      </span>
    );
  if (!canExclude) return null;
  return open ? (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await excludeRecordAction({ table, recordId, reason });
          if ("error" in result)
            setMessage(result.error ?? "Unable to exclude.");
          else {
            setMessage("Excluded.");
            router.refresh();
          }
        });
      }}
    >
      <input
        required
        minLength={3}
        maxLength={300}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason"
        className="rounded border bg-background px-2 py-1 text-xs"
      />
      <button disabled={pending} className="glass-pill px-2 py-1 text-xs">
        {pending ? "Saving…" : "Confirm"}
      </button>
      {message && <span className="text-xs">{message}</span>}
    </form>
  ) : (
    <button
      type="button"
      className="glass-pill px-2 py-1 text-xs"
      onClick={() => setOpen(true)}
    >
      Exclude as test data
    </button>
  );
}
