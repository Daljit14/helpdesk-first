"use client";

import { useActionState } from "react";
import { submitTicket, type TicketActionState } from "@/app/actions/guides";
import { Button } from "@/components/ui/button";

const initialState: TicketActionState = null;

export function TicketForm({ issueId }: { issueId: string }) {
  const [state, formAction, pending] = useActionState(
    submitTicket,
    initialState
  );

  if (state?.success) {
    return (
      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
        Your ticket was submitted. IT will follow up soon.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="issueId" value={issueId} />
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
          className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        {state?.fieldErrors?.message && (
          <p className="mt-1 text-sm text-destructive">
            {state.fieldErrors.message}
          </p>
        )}
      </div>
      <p className="text-sm text-amber-700 dark:text-amber-300">
        Do not include passwords, security codes or personal information
      </p>
      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit ticket"}
      </Button>
    </form>
  );
}
