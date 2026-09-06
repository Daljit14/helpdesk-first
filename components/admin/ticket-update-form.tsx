"use client";

import { useActionState } from "react";
import {
  updateTicket,
  type UpdateTicketState,
} from "@/app/actions/admin-tickets";
import { Button } from "@/components/ui/button";

const ADMIN_OUTLINE_BUTTON =
  "border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900";

const statuses = [
  "New",
  "In Progress",
  "Waiting",
  "Resolved",
  "Closed",
] as const;
const priorities = ["Low", "Normal", "High", "Urgent"] as const;

export function TicketUpdateForm({
  ticketId,
  status,
  priority,
  assignedAgent,
  resolutionTrackingEnabled = false,
  resolutionSummary = "",
}: {
  ticketId: string;
  status: (typeof statuses)[number];
  priority: (typeof priorities)[number];
  assignedAgent: string;
  resolutionTrackingEnabled?: boolean;
  resolutionSummary?: string;
}) {
  const [state, action, pending] = useActionState<UpdateTicketState, FormData>(
    updateTicket,
    null
  );

  return (
    <form
      action={action}
      className="mt-6 rounded-xl border border-slate-200 p-5"
    >
      <h2 className="font-semibold">Update ticket</h2>
      {state?.error && (
        <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-red-800">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p
          role="status"
          className="mt-4 rounded-md bg-emerald-50 p-3 text-emerald-800"
        >
          {state.success}
        </p>
      )}
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="ticket-status"
        >
          Status
          <select
            id="ticket-status"
            name="status"
            defaultValue={status}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="ticket-priority"
        >
          Priority
          <select
            id="ticket-priority"
            name="priority"
            defaultValue={priority}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {priorities.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label
          className="grid gap-2 text-sm font-medium"
          htmlFor="ticket-assigned-agent"
        >
          Assigned agent
          <input
            id="ticket-assigned-agent"
            name="assignedAgent"
            defaultValue={assignedAgent}
            maxLength={80}
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
        </label>
      </div>
      {resolutionTrackingEnabled && (
        <label
          className="mt-4 grid gap-2 text-sm font-medium"
          htmlFor="ticket-resolution-summary"
        >
          Resolution summary (private)
          <textarea
            id="ticket-resolution-summary"
            name="resolutionSummary"
            defaultValue={resolutionSummary}
            maxLength={500}
            rows={3}
            className="rounded-md border border-slate-300 bg-white p-3 text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
        </label>
      )}
      {!resolutionTrackingEnabled && (
        <input type="hidden" name="resolutionSummary" value="" />
      )}
      <Button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={`mt-5 ${ADMIN_OUTLINE_BUTTON}`}
        variant="outline"
      >
        Save changes
      </Button>
    </form>
  );
}
