import { toTicketId } from "@/lib/operations/transform";

export type TicketStage = 0 | 1 | 2 | 3 | 4 | 5;

export const TICKET_STAGES = [
  "Submitted",
  "Waiting for support",
  "Working on it",
  "Action needed from you",
  "Confirm fix",
  "Resolved",
] as const;

type TicketOwner = "you" | "support" | "unassigned" | "done";

export function ticketState(input: {
  status: string;
  assignedAgentId?: string | null;
  resolverType?: string | null;
}): {
  stage: TicketStage;
  stageLabel: string;
  owner: TicketOwner;
  ownerLabel: string;
  nextAction: string | null;
  label: string;
  description: string;
  attention: boolean;
  group: "open" | "previous";
} {
  const status = input.status.trim().toLowerCase();
  const assigned = Boolean(input.assignedAgentId);
  if (["new", "open", "ai reviewing"].includes(status)) {
    return {
      stage: 1,
      stageLabel: TICKET_STAGES[1],
      owner: "unassigned",
      ownerLabel: "Waiting for support",
      nextAction: null,
      label: "Reviewing",
      description: "We're reading your ticket.",
      attention: false,
      group: "open",
    };
  }
  if (status === "ai resolving") {
    return {
      stage: 3,
      stageLabel: TICKET_STAGES[3],
      owner: "you",
      ownerLabel: "Action needed from you",
      nextAction: "Try the suggested fix, then tell us whether it worked.",
      label: "Suggested fix ready",
      description:
        "Follow the recommended steps below, then tell us if it worked.",
      attention: true,
      group: "open",
    };
  }
  if (["needs human", "reopened"].includes(status)) {
    return assigned
      ? {
          stage: 2,
          stageLabel: TICKET_STAGES[2],
          owner: "support",
          ownerLabel: "Working on it",
          nextAction: null,
          label: "Working on it",
          description: "A support person is investigating.",
          attention: false,
          group: "open",
        }
      : {
          stage: 1,
          stageLabel: TICKET_STAGES[1],
          owner: "unassigned",
          ownerLabel: "Waiting for support",
          nextAction: null,
          label: "Waiting for support",
          description: "A support person will pick this up.",
          attention: false,
          group: "open",
        };
  }
  if (status === "in progress") {
    return {
      stage: 2,
      stageLabel: TICKET_STAGES[2],
      owner: "support",
      ownerLabel: "Working on it",
      nextAction: null,
      label: "Working on it",
      description: "Support is investigating.",
      attention: false,
      group: "open",
    };
  }
  if (["waiting", "waiting for user"].includes(status)) {
    return {
      stage: 3,
      stageLabel: TICKET_STAGES[3],
      owner: "you",
      ownerLabel: "Action needed from you",
      nextAction: "Reply below",
      label: "Your reply is needed",
      description: "Support asked you a question.",
      attention: true,
      group: "open",
    };
  }
  if (status === "pending verification") {
    return {
      stage: 4,
      stageLabel: TICKET_STAGES[4],
      owner: "you",
      ownerLabel: "Action needed from you",
      nextAction: "Choose Yes, it's fixed or No, still broken",
      label: "Please confirm",
      description: "Support believes this is fixed.",
      attention: true,
      group: "open",
    };
  }
  if (status === "resolved") {
    return {
      stage: 5,
      stageLabel: TICKET_STAGES[5],
      owner: "done",
      ownerLabel: "Resolved",
      nextAction: "Rate your experience or reopen within 14 days",
      label: "Resolved",
      description: "Marked resolved by support — tell us if it isn't fixed",
      attention: false,
      group: "previous",
    };
  }
  if (status === "closed") {
    return {
      stage: 5,
      stageLabel: TICKET_STAGES[5],
      owner: "done",
      ownerLabel: "Closed",
      nextAction: null,
      label: "Closed",
      description: "This ticket is closed.",
      attention: false,
      group: "previous",
    };
  }
  return {
    stage: 0,
    stageLabel: TICKET_STAGES[0],
    owner: assigned ? "support" : "unassigned",
    ownerLabel: assigned ? "Working on it" : "Waiting for support",
    nextAction: null,
    label: input.status,
    description: "",
    attention: false,
    group: "open",
  };
}

export type TicketStatusDescription = Pick<
  ReturnType<typeof ticketState>,
  "label" | "description" | "nextAction" | "attention" | "group"
>;

export function describeTicketStatus(
  status: string,
  opts: { assignedAgentId?: string | null; resolverType?: string | null } = {}
): TicketStatusDescription {
  return ticketState({ status, ...opts });
}

export function describeTicketAssignment({
  assignedAgentId,
  humanResponseDueAt,
  status,
  updatedAt,
  resolverType,
}: {
  assignedAgentId?: string | null;
  humanResponseDueAt?: string | null;
  status: string;
  updatedAt?: string | null;
  resolverType?: string | null;
}) {
  const state = ticketState({ status, assignedAgentId, resolverType });
  const closed = ["resolved", "closed"].includes(status.trim().toLowerCase());
  return {
    label: state.ownerLabel,
    expectedResponseBy:
      !closed && humanResponseDueAt
        ? `Expected next response by ${new Date(humanResponseDueAt).toLocaleString()}`
        : null,
    lastUpdated: updatedAt
      ? `Last updated ${new Date(updatedAt).toLocaleString()}`
      : null,
  };
}

export function ticketReference(id: string): string {
  return toTicketId(id);
}

export function progressStage(
  status: string,
  assignedAgentId?: string | null,
  resolverType?: string | null
): TicketStage {
  return ticketState({ status, assignedAgentId, resolverType }).stage;
}
