"use client";

import { useActionState, useState } from "react";
import {
  updateTicket,
  type UpdateTicketState,
} from "@/app/actions/admin-tickets";
import { SlidersHorizontal } from "lucide-react";

const PRIMARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";
const FIELD_CLASS =
  "h-10 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TEXTAREA_CLASS =
  "w-full min-w-0 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const LABEL_CLASS = "grid gap-1.5 text-xs font-bold text-muted-foreground";

const statuses = [
  "New",
  "In Progress",
  "Waiting",
  "Resolved",
  "Closed",
] as const;
const workflowStatuses = [
  "AI Reviewing",
  "AI Resolving",
  "Needs Human",
  "Waiting for User",
  "Pending Verification",
] as const;
const priorities = ["Low", "Normal", "High", "Urgent"] as const;

export function TicketUpdateForm({
  ticketId,
  status,
  priority,
  assignedAgent,
  resolutionTrackingEnabled = false,
  resolutionSummary = "",
  workflowEnabled = false,
  uiV2 = false,
}: {
  ticketId: string;
  status: string;
  priority: (typeof priorities)[number];
  assignedAgent: string;
  resolutionTrackingEnabled?: boolean;
  resolutionSummary?: string;
  workflowEnabled?: boolean;
  uiV2?: boolean;
}) {
  const [state, action, pending] = useActionState<UpdateTicketState, FormData>(
    updateTicket,
    null
  );
  const [currentStatus, setCurrentStatus] = useState<string>(status);
  const [currentPriority, setCurrentPriority] = useState(priority);
  const [currentAssignedAgent, setCurrentAssignedAgent] =
    useState(assignedAgent);
  const [currentResolutionSummary, setCurrentResolutionSummary] =
    useState(resolutionSummary);

  return (
    <form action={action} className="glass hf-rise p-5 sm:px-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold">Update ticket</h2>
          <p className="text-sm text-muted-foreground">
            Status, priority and owner
          </p>
        </div>
      </div>
      {state?.error && (
        <p
          role="alert"
          className="hf-swap mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive"
        >
          {state.error}
        </p>
      )}
      {state?.success && (
        <p
          role="status"
          className={
            uiV2
              ? "hf-swap mt-4 rounded-xl border border-border bg-muted p-3 text-sm font-semibold text-foreground"
              : "hf-swap mt-4 rounded-xl border border-status-success/30 bg-status-success/10 p-3 text-sm font-semibold text-status-success"
          }
        >
          {uiV2 && <span aria-hidden="true">✓ </span>}
          {state.success}
        </p>
      )}
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-1 [&>label]:min-w-0 [&_input]:min-w-0 [&_select]:min-w-0">
        <label className={LABEL_CLASS} htmlFor="ticket-status">
          Status
          <select
            id="ticket-status"
            name="status"
            value={currentStatus}
            onChange={(event) =>
              setCurrentStatus(event.target.value as (typeof statuses)[number])
            }
            className={FIELD_CLASS}
          >
            {(workflowEnabled
              ? [...statuses, ...workflowStatuses]
              : statuses
            ).map((value) => (
              <option
                key={value}
                value={value}
                disabled={
                  workflowEnabled && workflowStatuses.includes(value as never)
                }
              >
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL_CLASS} htmlFor="ticket-priority">
          Priority
          <select
            id="ticket-priority"
            name="priority"
            value={currentPriority}
            onChange={(event) =>
              setCurrentPriority(
                event.target.value as (typeof priorities)[number]
              )
            }
            className={FIELD_CLASS}
          >
            {priorities.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL_CLASS} htmlFor="ticket-assigned-agent">
          Assigned agent
          <input
            id="ticket-assigned-agent"
            name="assignedAgent"
            value={currentAssignedAgent}
            onChange={(event) => setCurrentAssignedAgent(event.target.value)}
            maxLength={80}
            className={FIELD_CLASS}
          />
        </label>
      </div>
      {resolutionTrackingEnabled && (
        <label
          className={`mt-4 ${LABEL_CLASS}`}
          htmlFor="ticket-resolution-summary"
        >
          Resolution summary (private)
          <textarea
            id="ticket-resolution-summary"
            name="resolutionSummary"
            value={currentResolutionSummary}
            onChange={(event) =>
              setCurrentResolutionSummary(event.target.value)
            }
            maxLength={500}
            rows={3}
            className={TEXTAREA_CLASS}
          />
        </label>
      )}
      {!resolutionTrackingEnabled && (
        <input type="hidden" name="resolutionSummary" value="" />
      )}
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={`mt-5 w-full justify-center ${PRIMARY_BUTTON}`}
      >
        Save changes
      </button>
    </form>
  );
}
