import { toTicketId } from "@/lib/operations/transform";

export type TicketStatusDescription = {
  label: string;
  description: string;
  nextAction: string | null;
  attention: boolean;
  group: "open" | "previous";
};

export function describeTicketAssignment({
  assignedAgentId,
  humanResponseDueAt,
  status,
  updatedAt,
}: {
  assignedAgentId?: string | null;
  humanResponseDueAt?: string | null;
  status: string;
  updatedAt?: string | null;
}) {
  const closed = ["resolved", "closed"].includes(status.trim().toLowerCase());
  return {
    label: assignedAgentId
      ? "Assigned to a support person"
      : "Waiting for a support person",
    expectedResponseBy:
      !closed && humanResponseDueAt
        ? `Expected next response by ${new Date(humanResponseDueAt).toLocaleString()}`
        : null,
    lastUpdated: updatedAt
      ? `Last updated ${new Date(updatedAt).toLocaleString()}`
      : null,
  };
}

export function describeTicketStatus(
  status: string,
  opts: { resolverType?: string | null } = {}
): TicketStatusDescription {
  void opts;
  const normalized = status.trim().toLowerCase();
  if (["new", "open", "ai reviewing"].includes(normalized)) {
    return {
      label: "Reviewing",
      description: "We're reading your ticket.",
      nextAction: null,
      attention: false,
      group: "open",
    };
  }
  if (normalized === "ai resolving") {
    return {
      label: "Suggested fix ready",
      description:
        "Follow the recommended steps below, then tell us if it worked.",
      nextAction: "Try the steps, then choose Fixed or Didn't work",
      attention: true,
      group: "open",
    };
  }
  if (normalized === "needs human") {
    return {
      label: "Waiting for a support person",
      description: "A support person will pick this up.",
      nextAction: null,
      attention: false,
      group: "open",
    };
  }
  if (normalized === "in progress") {
    return {
      label: "A person is working on it",
      description: "Support is investigating.",
      nextAction: null,
      attention: false,
      group: "open",
    };
  }
  if (["waiting", "waiting for user"].includes(normalized)) {
    return {
      label: "Your reply is needed",
      description: "Support asked you a question.",
      nextAction: "Reply below",
      attention: true,
      group: "open",
    };
  }
  if (normalized === "pending verification") {
    return {
      label: "Please confirm",
      description: "Support believes this is fixed.",
      nextAction: "Choose Yes, it's fixed or No, still broken",
      attention: true,
      group: "open",
    };
  }
  if (normalized === "reopened") {
    return {
      label: "Reopened",
      description: "A support person will pick this back up.",
      nextAction: null,
      attention: false,
      group: "open",
    };
  }
  if (normalized === "resolved") {
    return {
      label: "Resolved",
      description: "Marked resolved by support — tell us if it isn't fixed",
      nextAction: "Rate your experience or reopen within 14 days",
      attention: false,
      group: "previous",
    };
  }
  if (normalized === "closed") {
    return {
      label: "Closed",
      description: "This ticket is closed.",
      nextAction: null,
      attention: false,
      group: "previous",
    };
  }
  return {
    label: status,
    description: "",
    nextAction: null,
    attention: false,
    group: "open",
  };
}

export function ticketReference(id: string): string {
  return toTicketId(id);
}
