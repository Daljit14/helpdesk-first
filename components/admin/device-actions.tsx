"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  reviewDeviceShadowAction,
  revokeDeviceAction,
  revokeEnrollmentTokenAction,
} from "@/app/actions/admin-devices";

export function RevokeTokenButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      className="glass-pill px-3 py-1 text-xs"
      onClick={() =>
        startTransition(async () => {
          await revokeEnrollmentTokenAction(id);
          router.refresh();
        })
      }
    >
      {pending ? "Revoking…" : "Revoke"}
    </button>
  );
}

export function RevokeDeviceButton({ id }: { id: string }) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await revokeDeviceAction({ id, reason });
          setMessage(
            "error" in result
              ? (result.error ?? "Unable to revoke.")
              : "Revoked."
          );
          if (!("error" in result)) router.refresh();
        });
      }}
    >
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason"
        maxLength={500}
        className="w-48 rounded-xl border border-border/70 bg-background/60 px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="glass-pill px-3 py-1 text-xs"
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {message && (
        <span className="text-xs text-muted-foreground">{message}</span>
      )}
    </form>
  );
}

export function DeviceShadowReviewForm({ id }: { id: string }) {
  const [status, setStatus] = useState("agree");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const router = useRouter();
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await reviewDeviceShadowAction({ id, status, note });
          setMessage(
            "error" in result
              ? (result.error ?? "Unable to save review.")
              : "Review saved."
          );
          if (!("error" in result)) router.refresh();
        });
      }}
    >
      <select
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="rounded-xl border border-border/70 bg-background/60 px-2 py-1 text-xs"
      >
        <option value="agree">Agree</option>
        <option value="disagree">Disagree</option>
        <option value="unsafe">Unsafe</option>
      </select>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Review note"
        maxLength={2000}
        className="min-w-56 rounded-xl border border-border/70 bg-background/60 px-2 py-1 text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="glass-pill px-3 py-1 text-xs"
      >
        {pending ? "Saving…" : "Save review"}
      </button>
      {message && (
        <span className="text-xs text-muted-foreground">{message}</span>
      )}
    </form>
  );
}
