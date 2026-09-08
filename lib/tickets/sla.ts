export type SlaState = "ok" | "at_risk" | "breached" | "met";

export type SlaPriority = "Urgent" | "High" | "Normal" | "Low";
export type SlaTargets = {
  first_response: Record<SlaPriority, number>;
  resolution: Record<SlaPriority, number>;
};

export const DEFAULT_SLA_TARGETS: SlaTargets = {
  first_response: { Urgent: 5, High: 10, Normal: 60, Low: 480 },
  resolution: { Urgent: 240, High: 480, Normal: 1440, Low: 4320 },
};

export function humanResponseDue(
  priority: string,
  from: Date,
  targets: SlaTargets = DEFAULT_SLA_TARGETS
): Date {
  const minutes =
    targets.first_response[priority as SlaPriority] ??
    DEFAULT_SLA_TARGETS.first_response.Normal;
  return new Date(from.getTime() + minutes * 60_000);
}

export function resolutionDue(
  priority: string,
  from: Date,
  targets: SlaTargets = DEFAULT_SLA_TARGETS
): Date {
  const minutes =
    targets.resolution[priority as SlaPriority] ??
    DEFAULT_SLA_TARGETS.resolution.Normal;
  return new Date(from.getTime() + minutes * 60_000);
}

export async function getSlaTargets(
  organizationId: string
): Promise<SlaTargets> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data } = await createAdminClient()
    .from("organization_policies")
    .select("sla_targets")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const raw = data?.sla_targets as Partial<SlaTargets> | null | undefined;
  return {
    first_response: {
      ...DEFAULT_SLA_TARGETS.first_response,
      ...(raw?.first_response ?? {}),
    },
    resolution: {
      ...DEFAULT_SLA_TARGETS.resolution,
      ...(raw?.resolution ?? {}),
    },
  };
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
