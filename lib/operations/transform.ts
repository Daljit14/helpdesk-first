import { createHmac } from "node:crypto";
import { CATEGORIES, ISSUES } from "@/lib/issues";

export type OperationsStatus =
  "New" | "In Progress" | "Waiting" | "Resolved" | "Closed";
export type OperationsPriority = "Low" | "Normal" | "High" | "Urgent";
export type OperationsPlatform =
  "Windows" | "macOS" | "Linux" | "Android" | "iOS" | "Other";

export function pseudonymizeUser(userId: string, secret?: string): string {
  const salt =
    secret ??
    process.env.OPERATIONS_PSEUDONYM_SALT ??
    process.env.OPERATIONS_EXPORT_KEY;
  if (!salt) throw new Error("Operations pseudonymization secret is required.");
  return `usr_${createHmac("sha256", salt).update(userId).digest("hex").slice(0, 8)}`;
}

export function toTicketId(uuid: string): string {
  return `TCK-${uuid.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function normalizeStatus(raw: unknown): OperationsStatus {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "open" || value === "new") return "New";
  if (
    value === "in progress" ||
    value === "in_progress" ||
    value === "in-progress"
  ) {
    return "In Progress";
  }
  if (value === "waiting") return "Waiting";
  if (value === "resolved") return "Resolved";
  if (value === "closed") return "Closed";
  return "New";
}

export function normalizePriority(raw: unknown): OperationsPriority {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "low") return "Low";
  if (value === "high") return "High";
  if (value === "urgent") return "Urgent";
  return "Normal";
}

export function normalizePlatform(raw: unknown): OperationsPlatform {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "windows") return "Windows";
  if (value === "macos") return "macOS";
  if (value === "linux") return "Linux";
  if (value === "android") return "Android";
  if (value === "ios") return "iOS";
  return "Other";
}

export function slaDue(
  createdAt: string,
  priority: OperationsPriority
): string {
  const hours = { Urgent: 4, High: 8, Normal: 24, Low: 72 }[priority];
  return new Date(
    new Date(createdAt).getTime() + hours * 60 * 60 * 1000
  ).toISOString();
}

export function categoryLabel(issueId: string): string {
  const issue = ISSUES.find((candidate) => candidate.id === issueId);
  const category = CATEGORIES.find(
    (candidate) => candidate.id === issue?.category
  );
  return category?.label ?? "Other";
}

export function buildAgentQueue(
  tickets: OperationsTicketLike[],
  now: Date
): AgentQueueLike[] {
  const groups = new Map<string, OperationsTicketLike[]>();
  for (const ticket of tickets) {
    if (!ticket.assignedAgent) continue;
    const current = groups.get(ticket.assignedAgent) ?? [];
    current.push(ticket);
    groups.set(ticket.assignedAgent, current);
  }

  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  return [...groups.entries()].map(([agent, assigned]) => {
    const open = assigned.filter((ticket) =>
      ["New", "In Progress", "Waiting"].includes(ticket.status)
    );
    const urgentOpen = open.filter(
      (ticket) => ticket.priority === "Urgent"
    ).length;
    const slaBreached = open.filter(
      (ticket) => new Date(ticket.slaDue).getTime() < now.getTime()
    ).length;
    const resolvedToday = assigned.filter(
      (ticket) =>
        ["Resolved", "Closed"].includes(ticket.status) &&
        ticket.resolvedAt &&
        new Date(ticket.resolvedAt).getTime() >= startOfToday.getTime()
    ).length;
    const averageOpenAgeMinutes =
      open.length === 0
        ? null
        : Math.round(
            (open.reduce(
              (total, ticket) =>
                total +
                (now.getTime() - new Date(ticket.createdAt).getTime()) / 60000,
              0
            ) /
              open.length) *
              10
          ) / 10;
    const workload =
      urgentOpen > 0 || slaBreached > 0
        ? "Attention"
        : open.length >= 5
          ? "High"
          : open.length === 0
            ? "Clear"
            : "Normal";

    return {
      agent,
      assignedOpen: open.length,
      urgentOpen,
      slaBreached,
      waiting: open.filter((ticket) => ticket.status === "Waiting").length,
      resolvedToday,
      averageOpenAgeMinutes,
      workload,
    };
  });
}

export type OperationsTicketLike = {
  createdAt: string;
  status: OperationsStatus;
  priority: OperationsPriority;
  assignedAgent: string;
  slaDue: string;
  resolvedAt: string | null;
};

export type AgentQueueLike = {
  agent: string;
  assignedOpen: number;
  urgentOpen: number;
  slaBreached: number;
  waiting: number;
  resolvedToday: number;
  averageOpenAgeMinutes: number | null;
  workload: "Clear" | "Normal" | "High" | "Attention";
};
