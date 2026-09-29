"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  reviewDeviceShadowAction,
  revokeDeviceAction,
  revokeEnrollmentTokenAction,
} from "@/app/actions/admin-devices";

const SMALL_FIELD =
  "h-9 min-w-0 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const DANGER_BUTTON =
  "inline-flex h-9 items-center gap-1.5 rounded-xl border border-status-danger/40 bg-status-danger/10 px-3 text-xs font-extrabold text-status-danger shadow-sm transition-colors hover:bg-status-danger/20 disabled:opacity-60";
const PRIMARY_SMALL_BUTTON =
  "inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";

export function RevokeTokenButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      className={DANGER_BUTTON}
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
        className={`w-48 ${SMALL_FIELD}`}
      />
      <button type="submit" disabled={pending} className={DANGER_BUTTON}>
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {message && (
        <span
          role="status"
          className="hf-swap text-xs font-bold text-muted-foreground"
        >
          {message}
        </span>
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
        className={SMALL_FIELD}
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
        className={`min-w-56 flex-1 ${SMALL_FIELD}`}
      />
      <button type="submit" disabled={pending} className={PRIMARY_SMALL_BUTTON}>
        {pending ? "Saving…" : "Save review"}
      </button>
      {message && (
        <span
          role="status"
          className="hf-swap text-xs font-bold text-muted-foreground"
        >
          {message}
        </span>
      )}
    </form>
  );
}
