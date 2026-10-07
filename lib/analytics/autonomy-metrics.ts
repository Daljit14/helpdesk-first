import { getExcludedRecordIds } from "@/lib/admin/record-exclusions";
import {
  isAgentCostTrackingEnabled,
  isOrgEnvironmentEnabled,
} from "@/lib/admin/flags";
import { sanitizeForUser } from "@/lib/agent/untrusted";
import type { AdminSession } from "@/lib/admin/auth";
import { getIssueBySlug } from "@/lib/search";
import { decryptAgentText } from "@/lib/security/ticket-crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export const METRICS_DEFINITION_VERSION = 2;

export type AutonomyMetricsWindow = {
  windowDays: number;
  from: string;
  to: string;
};

export type HonestOutcome =
  | "ai_resolved"
  | "pending"
  | "false_resolved"
  | "staff_touched"
  | "unverified"
  | "abandoned"
  | "escalated";

export type HonestBreakdown = {
  key: string;
  sessions: number;
  aiResolved: number;
  falseResolved: number;
  staffTouched: number;
  abandoned: number;
  escalated: number;
  aiResolutionRate: number;
  falseResolvedRate: number;
};

export type HonestMetrics = {
  version: 2;
  sessions: number;
  outcomes: Record<HonestOutcome, number>;
  aiResolved: number;
  aiResolutionRate: number;
  falseResolved: number;
  falseResolvedRate: number;
  deflected: number;
  deflectionRate: number;
  abandoned: number;
  abandonmentRate: number;
  medianResolveMs: number;
  p90ResolveMs: number;
  pending: number;
  hiddenStaffTouch: number;
  repeatIssues: number;
  repeatIssueRate: number;
  sessionOutcomes: Array<{ sessionId: string; outcome: HonestOutcome }>;
  byCategory: HonestBreakdown[];
  byCapability: HonestBreakdown[];
};

export type EscalationReasonCount = {
  reason: string;
  count: number;
};

export type UnhandledIntent = {
  sessionId: string;
  startedAt: string;
  query: string;
};

export type AutonomyMetrics = {
  window: AutonomyMetricsWindow;
  sessions: number;
  aiResolved: number;
  aiResolutionRate: number;
  falseResolved: number;
  falseResolvedRate: number;
  outcomeFeedback: number;
  recentFeedback: Array<{
    sessionId: string;
    verdict: string;
    createdAt: string;
    text: string;
  }>;
  escalated: number;
  replyRedactedSessions: number;
  escalationRate: number;
  escalationReasons: EscalationReasonCount[];
  medianAiResolutionMs: number;
  medianHumanResolutionMs: number;
  unhandledIntents: UnhandledIntent[];
  unhandledIntentCount: number;
  costTracking: boolean;
  totalCostMicros: number;
  costPerAiResolutionMicros: number | null;
  orgEnvironment: boolean;
  clarifiedTickets: number;
  avgClarifyingQuestions: number | null;
  v2: HonestMetrics;
};

export type AutonomyMetricsInput = {
  excludedTicketIds?: ReadonlySet<string>;
  costTracking?: boolean;
  orgEnvironment?: boolean;
  investigationTurns?: Array<{ ticketId: string; questionIds: string[] }>;
  sessions: Array<{
    id: string;
    requesterId: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    lastUserMessage: string | null;
    resolutionSummary: string | null;
    backingTicketId: string | null;
    escalationTicketId: string | null;
    costMicros?: number | null;
    verifiedExecutionId?: string | null;
    userConfirmedAt?: string | null;
  }>;
  tickets: Array<{
    id: string;
    status: string | null;
    resolvedAt: string | null;
    category?: string | null;
  }>;
  systemEvents: Array<{
    ticketId: string;
    eventType: string;
    actorType: string;
    createdAt: string;
  }>;
  actions: Array<{
    ticketId: string;
    agentId: string | null;
    createdAt?: string;
  }>;
  steps: Array<{
    sessionId: string;
    kind: string;
    toolName: string | null;
    resultSummary: string | null;
    seq: number;
    capabilityId?: string | null;
  }>;
  feedback?: Array<{
    sessionId: string;
    verdict: string;
    createdAt: string;
    text: string | null;
  }>;
  reportTickets?: Array<{
    id: string;
    userId: string | null;
    category: string | null;
    createdAt: string;
  }>;
  deviceJobs?: Array<{ ticketId: string; deviceId: string }>;
};

const DAY_MS = 86_400_000;
const FALSE_RESOLUTION_WINDOW_MS = 7 * DAY_MS;

function median(values: number[]): number {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function parseSearchSlugs(summary: string | null): string[] {
  if (!summary) return [];
  const match = summary.match(/^\d+\s+guides found(?::\s*(.*))?$/);
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

function firstSearchSlugs(
  steps: AutonomyMetricsInput["steps"],
  sessionId: string
): string[] {
  const step = steps
    .filter(
      (candidate) =>
        candidate.sessionId === sessionId &&
        candidate.kind === "tool_result" &&
        candidate.toolName === "search_guides"
    )
    .sort((left, right) => left.seq - right.seq)[0];
  return parseSearchSlugs(step?.resultSummary ?? null);
}

const HONEST_72_HOURS_MS = 72 * 60 * 60_000;
const HONEST_30_DAYS_MS = 30 * DAY_MS;

function emptyHonestOutcomes(): Record<HonestOutcome, number> {
  return {
    ai_resolved: 0,
    pending: 0,
    false_resolved: 0,
    staff_touched: 0,
    unverified: 0,
    abandoned: 0,
    escalated: 0,
  };
}

function emptyHonestBreakdown(key: string) {
  return {
    key,
    sessions: 0,
    aiResolved: 0,
    falseResolved: 0,
    staffTouched: 0,
    abandoned: 0,
    escalated: 0,
  };
}

export function emptyHonestMetrics(): HonestMetrics {
  return {
    version: 2,
    sessions: 0,
    outcomes: emptyHonestOutcomes(),
    aiResolved: 0,
    aiResolutionRate: 0,
    falseResolved: 0,
    falseResolvedRate: 0,
    deflected: 0,
    deflectionRate: 0,
    abandoned: 0,
    abandonmentRate: 0,
    medianResolveMs: 0,
    p90ResolveMs: 0,
    pending: 0,
    hiddenStaffTouch: 0,
    repeatIssues: 0,
    repeatIssueRate: 0,
    sessionOutcomes: [],
    byCategory: [],
    byCapability: [],
  };
}

function honestBreakdowns(
  source: Map<string, ReturnType<typeof emptyHonestBreakdown>>
): HonestBreakdown[] {
  return [...source.values()]
    .map((row) => ({
      ...row,
      aiResolutionRate: row.sessions > 0 ? row.aiResolved / row.sessions : 0,
      falseResolvedRate:
        row.aiResolved + row.falseResolved > 0
          ? row.falseResolved / (row.aiResolved + row.falseResolved)
          : 0,
    }))
    .sort(
      (left, right) =>
        right.sessions - left.sessions || left.key.localeCompare(right.key)
    );
}

function computeHonestMetrics(
  input: AutonomyMetricsInput,
  window: AutonomyMetricsWindow
): HonestMetrics {
  const now = Date.parse(window.to);
  const from = Date.parse(window.from);
  const to = now;
  const ticketsById = new Map(
    input.tickets.map((ticket) => [ticket.id, ticket])
  );
  const stepsBySession = new Map<string, AutonomyMetricsInput["steps"]>();
  for (const step of input.steps) {
    const steps = stepsBySession.get(step.sessionId) ?? [];
    steps.push(step);
    stepsBySession.set(step.sessionId, steps);
  }
  for (const steps of stepsBySession.values())
    steps.sort((left, right) => left.seq - right.seq);

  const deviceByTicket = new Map<string, string>();
  for (const job of input.deviceJobs ?? []) {
    if (!deviceByTicket.has(job.ticketId))
      deviceByTicket.set(job.ticketId, job.deviceId);
  }

  const categoryFor = (
    session: AutonomyMetricsInput["sessions"][number]
  ): string => {
    const ticketCategory = (
      session.backingTicketId
        ? ticketsById.get(session.backingTicketId)?.category
        : null
    )?.trim();
    const escalationCategory = (
      session.escalationTicketId
        ? ticketsById.get(session.escalationTicketId)?.category
        : null
    )?.trim();
    if (ticketCategory) return ticketCategory;
    if (escalationCategory) return escalationCategory;
    const slug = firstSearchSlugs(
      stepsBySession.get(session.id) ?? [],
      session.id
    )[0];
    return (slug ? getIssueBySlug(slug)?.category : null) ?? "uncategorized";
  };

  const metadata = new Map(
    input.sessions.map((session) => {
      const steps = stepsBySession.get(session.id) ?? [];
      const firstAction = steps.find(
        (step) =>
          step.kind === "action_executing" || step.kind === "action_autorun"
      );
      const touchTimes: Array<string | undefined> = [];
      if (session.backingTicketId) {
        touchTimes.push(
          ...(input.systemEvents
            .filter(
              (event) =>
                event.ticketId === session.backingTicketId &&
                event.actorType === "employee"
            )
            .map((event) => event.createdAt) ?? []),
          ...input.actions
            .filter(
              (action) =>
                action.ticketId === session.backingTicketId &&
                action.agentId !== null
            )
            .map((action) => action.createdAt)
        );
      }
      return [
        session.id,
        {
          category: categoryFor(session),
          capability: firstAction?.capabilityId || "none",
          deviceId: session.backingTicketId
            ? (deviceByTicket.get(session.backingTicketId) ?? null)
            : null,
          touchTimes,
          hasStaffTouch: touchTimes.length > 0,
          hiddenStaffTouch:
            Number.isFinite(Date.parse(session.endedAt ?? "")) &&
            touchTimes.some((timestamp) => {
              const touchedAt = Date.parse(timestamp ?? "");
              return (
                Number.isFinite(touchedAt) &&
                touchedAt >= Date.parse(session.endedAt as string)
              );
            }),
        },
      ] as const;
    })
  );

  const isExcluded = (session: AutonomyMetricsInput["sessions"][number]) =>
    Boolean(
      (session.backingTicketId &&
        input.excludedTicketIds?.has(session.backingTicketId)) ||
      (session.escalationTicketId &&
        input.excludedTicketIds?.has(session.escalationTicketId))
    );
  const candidateSessions = input.sessions.filter((session) => {
    const startedAt = Date.parse(session.startedAt);
    return (
      session.status !== "active" &&
      Number.isFinite(startedAt) &&
      startedAt >= from &&
      startedAt <= to &&
      !isExcluded(session)
    );
  });
  const candidateReportTickets = input.reportTickets ?? [];
  const feedbackSessionIds = new Set(
    (input.feedback ?? []).map((feedback) => feedback.sessionId)
  );
  const sessionOutcomes: Array<{
    sessionId: string;
    outcome: HonestOutcome;
  }> = [];
  const outcomes = emptyHonestOutcomes();
  const categoryRows = new Map<
    string,
    ReturnType<typeof emptyHonestBreakdown>
  >();
  const capabilityRows = new Map<
    string,
    ReturnType<typeof emptyHonestBreakdown>
  >();
  let deflected = 0;
  let hiddenStaffTouch = 0;
  let repeatIssues = 0;
  const resolveDurations: number[] = [];

  const hasSameIssueWithin = (
    session: AutonomyMetricsInput["sessions"][number],
    rangeMs: number
  ): boolean => {
    const sessionCategory =
      metadata.get(session.id)?.category ?? "uncategorized";
    const endedAt = Date.parse(session.endedAt ?? "");
    if (sessionCategory === "uncategorized" || !Number.isFinite(endedAt))
      return false;
    const identityMatches = (
      candidateUserId: string | null,
      candidateDeviceId: string | null
    ) =>
      session.requesterId === candidateUserId ||
      Boolean(
        metadata.get(session.id)?.deviceId &&
        candidateDeviceId &&
        metadata.get(session.id)?.deviceId === candidateDeviceId
      );
    const laterThanEnd = (timestamp: string) => {
      const candidateAt = Date.parse(timestamp);
      return (
        Number.isFinite(candidateAt) &&
        candidateAt > endedAt &&
        candidateAt <= endedAt + rangeMs
      );
    };

    if (
      candidateSessions.some((candidate) => {
        if (candidate.id === session.id) return false;
        const candidateMeta = metadata.get(candidate.id);
        return (
          candidateMeta?.category === sessionCategory &&
          identityMatches(candidate.requesterId, candidateMeta.deviceId) &&
          laterThanEnd(candidate.startedAt)
        );
      })
    )
      return true;

    return candidateReportTickets.some((candidate) => {
      if (
        candidate.id === session.backingTicketId ||
        candidate.id === session.escalationTicketId ||
        input.excludedTicketIds?.has(candidate.id) ||
        candidate.category?.trim() !== sessionCategory
      )
        return false;
      return (
        identityMatches(
          candidate.userId,
          deviceByTicket.get(candidate.id) ?? null
        ) && laterThanEnd(candidate.createdAt)
      );
    });
  };

  const reopenWithinSevenDays = (
    session: AutonomyMetricsInput["sessions"][number]
  ) => {
    const endedAt = Date.parse(session.endedAt ?? "");
    const ticket = session.backingTicketId
      ? ticketsById.get(session.backingTicketId)
      : undefined;
    return (
      ticket?.status?.toLowerCase() === "reopened" ||
      (Boolean(session.backingTicketId) &&
        Number.isFinite(endedAt) &&
        input.systemEvents.some((event) => {
          if (
            event.ticketId !== session.backingTicketId ||
            event.eventType !== "ticket.reopened"
          )
            return false;
          const createdAt = Date.parse(event.createdAt);
          return (
            createdAt >= endedAt &&
            createdAt <= endedAt + FALSE_RESOLUTION_WINDOW_MS
          );
        }))
    );
  };

  for (const session of candidateSessions) {
    let outcome: HonestOutcome | null = null;
    const sessionSteps = stepsBySession.get(session.id) ?? [];
    const sessionMeta = metadata.get(session.id);
    const hasAction = sessionSteps.some(
      (step) =>
        step.kind === "action_executing" || step.kind === "action_autorun"
    );
    if (session.status === "abandoned") outcome = "abandoned";
    else if (session.status === "escalated" || session.status === "halted")
      outcome = "escalated";
    else if (session.status === "resolved") {
      if (hasAction && !session.verifiedExecutionId) outcome = "unverified";
      else if (sessionMeta?.hasStaffTouch) outcome = "staff_touched";
      else if (
        feedbackSessionIds.has(session.id) ||
        reopenWithinSevenDays(session) ||
        hasSameIssueWithin(session, HONEST_72_HOURS_MS)
      )
        outcome = "false_resolved";
      else if (
        !session.userConfirmedAt &&
        now < Date.parse(session.endedAt ?? "") + HONEST_72_HOURS_MS
      )
        outcome = "pending";
      else outcome = "ai_resolved";
    }
    if (!outcome) continue;

    sessionOutcomes.push({ sessionId: session.id, outcome });
    outcomes[outcome] += 1;
    const categoryKey = sessionMeta?.category ?? "uncategorized";
    const capabilityKey = sessionMeta?.capability ?? "none";
    const categoryRow =
      categoryRows.get(categoryKey) ?? emptyHonestBreakdown(categoryKey);
    const capabilityRow =
      capabilityRows.get(capabilityKey) ?? emptyHonestBreakdown(capabilityKey);
    for (const row of [categoryRow, capabilityRow]) {
      row.sessions += 1;
      if (outcome === "ai_resolved") row.aiResolved += 1;
      if (outcome === "false_resolved") row.falseResolved += 1;
      if (outcome === "staff_touched") row.staffTouched += 1;
      if (outcome === "abandoned") row.abandoned += 1;
      if (outcome === "escalated") row.escalated += 1;
    }
    categoryRows.set(categoryKey, categoryRow);
    capabilityRows.set(capabilityKey, capabilityRow);

    if (
      !session.escalationTicketId &&
      outcome !== "escalated" &&
      !sessionMeta?.hasStaffTouch
    )
      deflected += 1;
    if (sessionMeta?.hiddenStaffTouch) hiddenStaffTouch += 1;
    if (outcome === "ai_resolved") {
      if (hasSameIssueWithin(session, HONEST_30_DAYS_MS)) repeatIssues += 1;
      if (session.endedAt) {
        const duration =
          Date.parse(session.endedAt) - Date.parse(session.startedAt);
        if (Number.isFinite(duration) && duration >= 0)
          resolveDurations.push(duration);
      }
    }
  }

  const aiResolved = outcomes.ai_resolved;
  const falseResolved = outcomes.false_resolved;
  const abandoned = outcomes.abandoned;
  const sortedDurations = [...resolveDurations].sort(
    (left, right) => left - right
  );
  return {
    version: 2,
    sessions: sessionOutcomes.length,
    outcomes,
    aiResolved,
    aiResolutionRate:
      sessionOutcomes.length > 0 ? aiResolved / sessionOutcomes.length : 0,
    falseResolved,
    falseResolvedRate:
      aiResolved + falseResolved > 0
        ? falseResolved / (aiResolved + falseResolved)
        : 0,
    deflected,
    deflectionRate:
      sessionOutcomes.length > 0 ? deflected / sessionOutcomes.length : 0,
    abandoned,
    abandonmentRate:
      sessionOutcomes.length > 0 ? abandoned / sessionOutcomes.length : 0,
    medianResolveMs: median(resolveDurations),
    p90ResolveMs:
      sortedDurations.length > 0
        ? sortedDurations[Math.ceil(0.9 * sortedDurations.length) - 1]
        : 0,
    pending: outcomes.pending,
    hiddenStaffTouch,
    repeatIssues,
    repeatIssueRate: aiResolved > 0 ? repeatIssues / aiResolved : 0,
    sessionOutcomes,
    byCategory: honestBreakdowns(categoryRows),
    byCapability: honestBreakdowns(capabilityRows),
  };
}

function normalizeEscalationReason(summary: string | null): string {
  const token = summary?.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!token) return "unknown";
  if (token.startsWith("budget:")) return "budget";
  if (token.startsWith("requester_agent_tripwire:")) return "tripwire";
  return token.slice(0, 40);
}

function zeroMetrics(window: AutonomyMetricsWindow): AutonomyMetrics {
  return {
    window,
    sessions: 0,
    aiResolved: 0,
    aiResolutionRate: 0,
    falseResolved: 0,
    falseResolvedRate: 0,
    outcomeFeedback: 0,
    recentFeedback: [],
    escalated: 0,
    replyRedactedSessions: 0,
    escalationRate: 0,
    escalationReasons: [],
    medianAiResolutionMs: 0,
    medianHumanResolutionMs: 0,
    unhandledIntents: [],
    unhandledIntentCount: 0,
    costTracking: false,
    totalCostMicros: 0,
    costPerAiResolutionMicros: null,
    orgEnvironment: false,
    clarifiedTickets: 0,
    avgClarifyingQuestions: null,
    v2: emptyHonestMetrics(),
  };
}

export function computeAutonomyMetrics(
  input: AutonomyMetricsInput,
  window: AutonomyMetricsWindow
): AutonomyMetrics {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  const sessions = input.sessions.filter((session) => {
    const startedAt = Date.parse(session.startedAt);
    return (
      session.status !== "active" &&
      Number.isFinite(startedAt) &&
      startedAt >= from &&
      startedAt <= to &&
      !(
        (session.backingTicketId &&
          input.excludedTicketIds?.has(session.backingTicketId)) ||
        (session.escalationTicketId &&
          input.excludedTicketIds?.has(session.escalationTicketId))
      )
    );
  });
  const ticketsById = new Map(
    input.tickets.map((ticket) => [ticket.id, ticket])
  );
  const eventsByTicket = new Map<
    string,
    AutonomyMetricsInput["systemEvents"]
  >();
  for (const event of input.systemEvents) {
    const events = eventsByTicket.get(event.ticketId) ?? [];
    events.push(event);
    eventsByTicket.set(event.ticketId, events);
  }
  const actionsByTicket = new Map<string, AutonomyMetricsInput["actions"]>();
  for (const action of input.actions) {
    const actions = actionsByTicket.get(action.ticketId) ?? [];
    actions.push(action);
    actionsByTicket.set(action.ticketId, actions);
  }
  const stepsBySession = new Map<string, AutonomyMetricsInput["steps"]>();
  for (const step of input.steps) {
    const steps = stepsBySession.get(step.sessionId) ?? [];
    steps.push(step);
    stepsBySession.set(step.sessionId, steps);
  }

  const hasStaffTouch = (session: AutonomyMetricsInput["sessions"][number]) =>
    session.backingTicketId !== null &&
    ((eventsByTicket.get(session.backingTicketId) ?? []).some(
      (event) => event.actorType === "employee"
    ) ||
      (actionsByTicket.get(session.backingTicketId) ?? []).some(
        (action) => action.agentId !== null
      ));

  const aiResolvedSessions = sessions.filter(
    (session) => session.status === "resolved" && !hasStaffTouch(session)
  );
  const inWindowSessionIds = new Set(sessions.map((session) => session.id));
  const feedback = (input.feedback ?? [])
    .filter((item) => inWindowSessionIds.has(item.sessionId))
    .sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
    );
  const feedbackSessionIds = new Set(feedback.map((item) => item.sessionId));
  const replyRedactedSessions = new Set(
    input.steps
      .filter(
        (step) =>
          step.kind === "reply_redacted" &&
          inWindowSessionIds.has(step.sessionId)
      )
      .map((step) => step.sessionId)
  ).size;
  const falseResolvedSessions = aiResolvedSessions.filter((session) => {
    if (feedbackSessionIds.has(session.id)) return true;
    const endedAt = session.endedAt ? Date.parse(session.endedAt) : NaN;
    const backingTicket = session.backingTicketId
      ? ticketsById.get(session.backingTicketId)
      : undefined;
    if (
      backingTicket?.status?.toLowerCase() === "reopened" ||
      (session.backingTicketId &&
        Number.isFinite(endedAt) &&
        (eventsByTicket.get(session.backingTicketId) ?? []).some((event) => {
          const createdAt = Date.parse(event.createdAt);
          return (
            event.eventType === "ticket.reopened" &&
            createdAt >= endedAt &&
            createdAt <= endedAt + FALSE_RESOLUTION_WINDOW_MS
          );
        }))
    ) {
      return true;
    }
    const sessionSlugs = new Set(
      firstSearchSlugs(stepsBySession.get(session.id) ?? [], session.id)
    );
    if (sessionSlugs.size === 0 || !Number.isFinite(endedAt)) return false;
    return sessions.some((candidate) => {
      if (
        candidate.id === session.id ||
        candidate.requesterId !== session.requesterId
      )
        return false;
      const candidateStartedAt = Date.parse(candidate.startedAt);
      if (
        !Number.isFinite(candidateStartedAt) ||
        candidateStartedAt < endedAt ||
        candidateStartedAt > endedAt + FALSE_RESOLUTION_WINDOW_MS
      )
        return false;
      return firstSearchSlugs(
        stepsBySession.get(candidate.id) ?? [],
        candidate.id
      ).some((slug) => sessionSlugs.has(slug));
    });
  });

  const escalatedSessions = sessions.filter(
    (session) => session.status === "escalated" || session.status === "halted"
  );
  const reasonCounts = new Map<string, number>();
  for (const session of escalatedSessions) {
    const reason = normalizeEscalationReason(session.resolutionSummary);
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const escalationReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => {
      const countOrder = right.count - left.count;
      return countOrder || left.reason.localeCompare(right.reason);
    })
    .slice(0, 5);

  const allUnhandledIntents = sessions
    .filter((session) => session.status !== "resolved")
    .filter((session) => {
      const steps = stepsBySession.get(session.id) ?? [];
      const hasEmptySearch = steps.some(
        (step) =>
          step.kind === "tool_result" &&
          step.toolName === "search_guides" &&
          (step.resultSummary ?? "").startsWith("0 guides found")
      );
      const hasAction = steps.some(
        (step) =>
          step.kind === "action_proposed" || step.kind === "action_autorun"
      );
      return hasEmptySearch && !hasAction;
    })
    .sort((left, right) => {
      const rightTime = Date.parse(right.startedAt);
      const leftTime = Date.parse(left.startedAt);
      return rightTime - leftTime;
    })
    .map((session) => ({
      sessionId: session.id,
      startedAt: session.startedAt,
      query: sanitizeForUser(session.lastUserMessage ?? "").slice(0, 120),
    }));
  const unhandledIntents = allUnhandledIntents.slice(0, 20);

  const resolvedDurations = sessions
    .filter((session) => session.status === "resolved" && session.endedAt)
    .map((session) => {
      const endedAt = Date.parse(session.endedAt as string);
      return endedAt - Date.parse(session.startedAt);
    });
  const humanDurations = escalatedSessions
    .map((session) => {
      const ticket = session.escalationTicketId
        ? ticketsById.get(session.escalationTicketId)
        : undefined;
      if (!ticket?.resolvedAt) return null;
      return Date.parse(ticket.resolvedAt) - Date.parse(session.startedAt);
    })
    .filter((value): value is number => value !== null);
  const recentFeedback = feedback.slice(0, 20).map((item) => ({
    sessionId: item.sessionId,
    verdict: item.verdict,
    createdAt: item.createdAt,
    text: sanitizeForUser(item.text ?? "").slice(0, 300),
  }));
  const costTracking = Boolean(input.costTracking);
  const totalCostMicros = costTracking
    ? sessions.reduce((total, session) => total + (session.costMicros ?? 0), 0)
    : 0;
  let clarifiedTickets = 0;
  let avgClarifyingQuestions: number | null = null;
  if (input.orgEnvironment) {
    const questionsByTicket = new Map<string, Set<string>>();
    for (const turn of input.investigationTurns ?? []) {
      if (input.excludedTicketIds?.has(turn.ticketId)) continue;
      const questions =
        questionsByTicket.get(turn.ticketId) ?? new Set<string>();
      for (const questionId of turn.questionIds) questions.add(questionId);
      questionsByTicket.set(turn.ticketId, questions);
    }
    clarifiedTickets = questionsByTicket.size;
    if (clarifiedTickets > 0) {
      const totalQuestions = [...questionsByTicket.values()].reduce(
        (total, questions) => total + questions.size,
        0
      );
      avgClarifyingQuestions = totalQuestions / clarifiedTickets;
    }
  }

  return {
    window,
    sessions: sessions.length,
    aiResolved: aiResolvedSessions.length,
    aiResolutionRate: sessions.length
      ? aiResolvedSessions.length / sessions.length
      : 0,
    falseResolved: falseResolvedSessions.length,
    falseResolvedRate: aiResolvedSessions.length
      ? falseResolvedSessions.length / aiResolvedSessions.length
      : 0,
    outcomeFeedback: feedbackSessionIds.size,
    recentFeedback,
    escalated: escalatedSessions.length,
    replyRedactedSessions,
    escalationRate: sessions.length
      ? escalatedSessions.length / sessions.length
      : 0,
    escalationReasons,
    medianAiResolutionMs: median(resolvedDurations),
    medianHumanResolutionMs: median(humanDurations),
    unhandledIntents,
    unhandledIntentCount: allUnhandledIntents.length,
    costTracking,
    totalCostMicros,
    costPerAiResolutionMicros:
      costTracking && aiResolvedSessions.length > 0
        ? totalCostMicros / aiResolvedSessions.length
        : null,
    orgEnvironment: Boolean(input.orgEnvironment),
    clarifiedTickets,
    avgClarifyingQuestions,
    v2: computeHonestMetrics(input, window),
  };
}

function isMissingAgentSessionsTable(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "42P01" ||
    (/agent_sessions/i.test(error.message ?? "") &&
      /does not exist|schema cache/i.test(error.message ?? ""))
  );
}

function isMissingOutcomeFeedbackTable(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (/agent_outcome_feedback/i.test(error.message ?? "") &&
      /does not exist|schema cache/i.test(error.message ?? ""))
  );
}

function isMissingInvestigationTurnsTable(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (/ticket_investigation_turns/i.test(error.message ?? "") &&
      /does not exist|schema cache/i.test(error.message ?? ""))
  );
}

function isMissingDeviceJobsTable(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (/device_jobs/i.test(error.message ?? "") &&
      /does not exist|schema cache/i.test(error.message ?? ""))
  );
}

function metricsWindow(windowDays: number): AutonomyMetricsWindow {
  const to = new Date();
  const from = new Date(to.getTime() - windowDays * DAY_MS);
  return {
    windowDays,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export async function loadAutonomyMetrics(
  admin: Admin,
  organizationId: string,
  opts: { windowDays?: number; includeExcluded?: boolean } = {}
): Promise<AutonomyMetrics> {
  const window = metricsWindow(opts.windowDays ?? 30);
  const costTracking = isAgentCostTrackingEnabled();
  const orgEnvironment = isOrgEnvironmentEnabled();
  const sessionSelect =
    "id,requester_id,status,started_at,ended_at,last_user_message,resolution_summary,backing_ticket_id,escalation_ticket_id,verified_execution_id,user_confirmed_at";
  const sessionResult = await admin
    .from("agent_sessions")
    .select(costTracking ? `${sessionSelect},cost_micros` : sessionSelect)
    .eq("organization_id", organizationId)
    .gte("started_at", window.from)
    .neq("status", "active")
    .order("started_at", { ascending: false });
  if (sessionResult.error) {
    if (isMissingAgentSessionsTable(sessionResult.error))
      return zeroMetrics(window);
    throw sessionResult.error;
  }
  const excluded = opts.includeExcluded
    ? new Set<string>()
    : await getExcludedRecordIds(admin, organizationId, "tickets");
  const rawSessions = (sessionResult.data ?? []) as unknown as Array<{
    id: string;
    requester_id: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    last_user_message: string | null;
    resolution_summary: string | null;
    backing_ticket_id: string | null;
    escalation_ticket_id: string | null;
    verified_execution_id?: string | null;
    user_confirmed_at?: string | null;
    cost_micros?: number | null;
  }>;
  const selectedRows = rawSessions.filter(
    (row) =>
      !(
        (row.backing_ticket_id && excluded.has(row.backing_ticket_id)) ||
        (row.escalation_ticket_id && excluded.has(row.escalation_ticket_id))
      )
  );
  const sessionIds = selectedRows.map((row) => row.id);
  const ticketIds = [
    ...new Set(
      selectedRows.flatMap((row) =>
        [row.backing_ticket_id, row.escalation_ticket_id].filter(
          (value): value is string => Boolean(value)
        )
      )
    ),
  ];
  const backingTicketIds = [
    ...new Set(
      selectedRows
        .map((row) => row.backing_ticket_id)
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const [
    ticketResult,
    reportTicketResult,
    deviceJobResult,
    eventResult,
    actionResult,
    stepResult,
    feedbackResult,
    investigationTurnsResult,
  ] = await Promise.all([
    ticketIds.length
      ? admin
          .from("tickets")
          .select("id,status,resolved_at,category")
          .eq("organization_id", organizationId)
          .in("id", ticketIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("tickets")
      .select("id,user_id,category,created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", window.from),
    backingTicketIds.length
      ? admin
          .from("device_jobs")
          .select("ticket_id,device_id")
          .eq("organization_id", organizationId)
          .in("ticket_id", backingTicketIds)
      : Promise.resolve({ data: [], error: null }),
    ticketIds.length
      ? admin
          .from("ticket_system_events")
          .select("ticket_id,event_type,actor_type,created_at")
          .eq("organization_id", organizationId)
          .in("ticket_id", ticketIds)
      : Promise.resolve({ data: [], error: null }),
    ticketIds.length
      ? admin
          .from("ticket_actions")
          .select("ticket_id,agent_id,created_at")
          .eq("organization_id", organizationId)
          .in("ticket_id", ticketIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? admin
          .from("agent_steps")
          .select("session_id,kind,tool_name,result_summary,seq,capability_id")
          .eq("organization_id", organizationId)
          .in("session_id", sessionIds)
          .order("seq", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? admin
          .from("agent_outcome_feedback")
          .select("session_id,verdict,created_at,free_text")
          .eq("organization_id", organizationId)
          .in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    orgEnvironment
      ? admin
          .from("ticket_investigation_turns")
          .select("ticket_id,question_ids")
          .eq("organization_id", organizationId)
          .gte("created_at", window.from)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [
    ticketResult,
    reportTicketResult,
    eventResult,
    actionResult,
    stepResult,
  ]) {
    if (result.error) throw result.error;
  }
  if (deviceJobResult.error && !isMissingDeviceJobsTable(deviceJobResult.error))
    throw deviceJobResult.error;
  if (
    feedbackResult.error &&
    !isMissingOutcomeFeedbackTable(feedbackResult.error)
  ) {
    throw feedbackResult.error;
  }
  if (
    investigationTurnsResult.error &&
    !isMissingInvestigationTurnsTable(investigationTurnsResult.error)
  ) {
    throw investigationTurnsResult.error;
  }
  const sessions = await Promise.all(
    selectedRows.map(async (row) => ({
      id: row.id,
      requesterId: row.requester_id,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      lastUserMessage: await decryptAgentText(
        admin,
        organizationId,
        "agent_sessions",
        "last_user_message",
        row.last_user_message
      ),
      resolutionSummary: await decryptAgentText(
        admin,
        organizationId,
        "agent_sessions",
        "resolution_summary",
        row.resolution_summary
      ),
      backingTicketId: row.backing_ticket_id,
      escalationTicketId: row.escalation_ticket_id,
      verifiedExecutionId: row.verified_execution_id ?? null,
      userConfirmedAt: row.user_confirmed_at ?? null,
      ...(costTracking ? { costMicros: row.cost_micros ?? 0 } : {}),
    }))
  );
  const steps = await Promise.all(
    (
      (stepResult.data ?? []) as Array<{
        session_id: string;
        kind: string;
        tool_name: string | null;
        result_summary: string | null;
        seq: number;
        capability_id: string | null;
      }>
    ).map(async (row) => ({
      sessionId: row.session_id,
      kind: row.kind,
      toolName: row.tool_name,
      resultSummary: await decryptAgentText(
        admin,
        organizationId,
        "agent_steps",
        "result_summary",
        row.result_summary
      ),
      seq: row.seq,
      capabilityId: row.capability_id,
    }))
  );
  const feedback = await Promise.all(
    (
      (feedbackResult.error ? [] : (feedbackResult.data ?? [])) as Array<{
        session_id: string;
        verdict: string;
        created_at: string;
        free_text: string | null;
      }>
    ).map(async (row) => ({
      sessionId: row.session_id,
      verdict: row.verdict,
      createdAt: row.created_at,
      text: await decryptAgentText(
        admin,
        organizationId,
        "agent_outcome_feedback",
        "free_text",
        row.free_text
      ),
    }))
  );
  return computeAutonomyMetrics(
    {
      excludedTicketIds: excluded,
      sessions,
      tickets: (
        (ticketResult.data ?? []) as Array<{
          id: string;
          status: string | null;
          resolved_at: string | null;
          category: string | null;
        }>
      ).map((row) => ({
        id: row.id,
        status: row.status,
        resolvedAt: row.resolved_at,
        category: row.category,
      })),
      systemEvents: (
        (eventResult.data ?? []) as Array<{
          ticket_id: string;
          event_type: string;
          actor_type: string;
          created_at: string;
        }>
      ).map((row) => ({
        ticketId: row.ticket_id,
        eventType: row.event_type,
        actorType: row.actor_type,
        createdAt: row.created_at,
      })),
      actions: (
        (actionResult.data ?? []) as Array<{
          ticket_id: string;
          agent_id: string | null;
          created_at: string;
        }>
      ).map((row) => ({
        ticketId: row.ticket_id,
        agentId: row.agent_id,
        createdAt: row.created_at,
      })),
      steps,
      feedback,
      reportTickets: (
        (reportTicketResult.data ?? []) as Array<{
          id: string;
          user_id: string | null;
          category: string | null;
          created_at: string;
        }>
      ).map((row) => ({
        id: row.id,
        userId: row.user_id,
        category: row.category,
        createdAt: row.created_at,
      })),
      deviceJobs: (
        (deviceJobResult.error ? [] : (deviceJobResult.data ?? [])) as Array<{
          ticket_id: string;
          device_id: string;
        }>
      ).map((row) => ({
        ticketId: row.ticket_id,
        deviceId: row.device_id,
      })),
      costTracking,
      orgEnvironment,
      investigationTurns:
        investigationTurnsResult.error || !orgEnvironment
          ? []
          : (
              (investigationTurnsResult.data ?? []) as Array<{
                ticket_id: string;
                question_ids: string[] | null;
              }>
            ).map((row) => ({
              ticketId: row.ticket_id,
              questionIds: (row.question_ids ?? []).filter(
                (questionId): questionId is string =>
                  typeof questionId === "string"
              ),
            })),
    },
    window
  );
}

export async function getAutonomyMetrics(
  session: AdminSession,
  opts: { windowDays?: number; showExcluded?: boolean } = {}
): Promise<AutonomyMetrics> {
  return loadAutonomyMetrics(createAdminClient(), session.organizationId, {
    windowDays: opts.windowDays,
    includeExcluded: opts.showExcluded === true && session.role === "org_admin",
  });
}
