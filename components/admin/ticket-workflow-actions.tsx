"use client";

import { useState, useTransition } from "react";
import {
  addInternalNote,
  addPublicComment,
  claimTicket,
  requestInformation,
  requestVerification,
} from "@/app/actions/admin-workflow";

export function TicketWorkflowActions({
  ticketId,
  canClaim,
}: {
  ticketId: string;
  canClaim: boolean;
}) {
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const run = (action: () => Promise<{ error: string } | { success: true }>) =>
    startTransition(async () => {
      const result = await action();
      setNotice("error" in result ? result.error : "Saved.");
      if (!("error" in result)) setMessage("");
    });
  return (
    <div className="mt-6 rounded-xl border border-slate-200 p-5">
      <h2 className="font-semibold">Employee actions</h2>
      {canClaim && (
        <button
          type="button"
          onClick={() => run(() => claimTicket(ticketId))}
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2"
        >
          Claim ticket
        </button>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          placeholder="Write a public reply or internal note"
          className="rounded-lg border border-slate-300 p-3 sm:col-span-2"
        />
        <button
          type="button"
          onClick={() => run(() => addPublicComment(ticketId, message))}
          className="rounded-lg bg-slate-900 px-4 py-2 text-white"
        >
          Public comment
        </button>
        <button
          type="button"
          onClick={() => run(() => addInternalNote(ticketId, message))}
          className="rounded-lg border border-slate-300 px-4 py-2"
        >
          Add internal note
        </button>
        <button
          type="button"
          onClick={() => run(() => requestInformation(ticketId, message))}
          className="rounded-lg border border-slate-300 px-4 py-2"
        >
          Request information
        </button>
        <button
          type="button"
          onClick={() => run(() => requestVerification(ticketId, message))}
          className="rounded-lg border border-slate-300 px-4 py-2"
        >
          Request verification
        </button>
      </div>
      {notice && <p className="mt-3 text-sm">{notice}</p>}
    </div>
  );
}
