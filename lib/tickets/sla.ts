export type SlaState = "ok" | "at_risk" | "breached" | "met";

export function humanResponseDue(priority: string, from: Date): Date {
  if (priority === "Urgent") return new Date(from.getTime() + 5 * 60_000);
  if (priority === "High") return new Date(from.getTime() + 10 * 60_000);
  if (priority === "Normal") return new Date(from.getTime() + 60 * 60_000);

  const due = new Date(from);
  due.setUTCDate(due.getUTCDate() + 1);
  while (due.getUTCDay() === 0 || due.getUTCDay() === 6) {
    due.setUTCDate(due.getUTCDate() + 1);
  }
  due.setUTCHours(9, 0, 0, 0);
  return due;
}

export function slaState(
  ticket: {
    status?: string | null;
    human_response_due_at?: string | null;
    first_human_response_at?: string | null;
  },
  now = new Date()
): SlaState {
  if (ticket.first_human_response_at) return "met";
  if (!ticket.human_response_due_at) return "ok";
  const due = new Date(ticket.human_response_due_at).getTime();
  const remaining = due - now.getTime();
  if (remaining <= 0) return "breached";
  if (remaining <= 10 * 60_000) return "at_risk";
  return "ok";
}

export function formatSlaCountdown(
  dueAt: string | null,
  now: Date
): string | null {
  if (!dueAt) return null;
  const difference = new Date(dueAt).getTime() - now.getTime();
  const absoluteMinutes = Math.ceil(Math.abs(difference) / 60_000);
  const days = Math.floor(absoluteMinutes / (24 * 60));
  const hours = Math.floor((absoluteMinutes % (24 * 60)) / 60);
  const minutes = absoluteMinutes % 60;
  const duration =
    days > 0
      ? `${days}d${hours > 0 ? ` ${hours}h` : ""}`
      : hours > 0
        ? `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`
        : `${minutes}m`;
  return difference >= 0 ? `${duration} left` : `overdue by ${duration}`;
}
