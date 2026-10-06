import { getExcludedRecordIds } from "@/lib/admin/record-exclusions";
import {
  isAgentCostTrackingEnabled,
  isOrgEnvironmentEnabled,
} from "@/lib/admin/flags";
import { sanitizeForUser } from "@/lib/agent/untrusted";
import type { AdminSession } from "@/lib/admin/auth";
import { decryptAgentText } from "@/lib/security/ticket-crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type AutonomyMetricsWindow = {
  windowDays: number;
  from: string;
  to: string;
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
  }>;
  tickets: Array<{
    id: string;
    status: string | null;
    resolvedAt: string | null;
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
  }>;
  steps: Array<{
    sessionId: string;
    kind: string;
    toolName: string | null;
    resultSummary: string | null;
    seq: number;
  }>;
  feedback?: Array<{
    sessionId: string;
    verdict: string;
    createdAt: string;
    text: string | null;
  }>;
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

function metricsWindow(windowDays: number): AutonomyMetricsWindow {
  const to = new Date();
  const from = new Date(to.getTime() - windowDays * DAY_MS);
  return {
    windowDays,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export async function getAutonomyMetrics(
  session: AdminSession,
  opts: { windowDays?: number; showExcluded?: boolean } = {}
): Promise<AutonomyMetrics> {
  const window = metricsWindow(opts.windowDays ?? 30);
  const admin = createAdminClient();
  const costTracking = isAgentCostTrackingEnabled();
  const orgEnvironment = isOrgEnvironmentEnabled();
  const sessionSelect =
    "id,requester_id,status,started_at,ended_at,last_user_message,resolution_summary,backing_ticket_id,escalation_ticket_id";
  const sessionResult = await admin
    .from("agent_sessions")
    .select(costTracking ? `${sessionSelect},cost_micros` : sessionSelect)
    .eq("organization_id", session.organizationId)
    .gte("started_at", window.from)
    .neq("status", "active")
    .order("started_at", { ascending: false });
  if (sessionResult.error) {
    if (isMissingAgentSessionsTable(sessionResult.error))
      return zeroMetrics(window);
    throw sessionResult.error;
  }
  const excluded =
    opts.showExcluded && session.role === "org_admin"
      ? new Set<string>()
      : await getExcludedRecordIds(admin, session.organizationId, "tickets");
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
  const [
    ticketResult,
    eventResult,
    actionResult,
    stepResult,
    feedbackResult,
    investigationTurnsResult,
  ] = await Promise.all([
    ticketIds.length
      ? admin
          .from("tickets")
          .select("id,status,resolved_at")
          .eq("organization_id", session.organizationId)
          .in("id", ticketIds)
      : Promise.resolve({ data: [], error: null }),
    ticketIds.length
      ? admin
          .from("ticket_system_events")
          .select("ticket_id,event_type,actor_type,created_at")
          .eq("organization_id", session.organizationId)
          .in("ticket_id", ticketIds)
      : Promise.resolve({ data: [], error: null }),
    ticketIds.length
      ? admin
          .from("ticket_actions")
          .select("ticket_id,agent_id")
          .eq("organization_id", session.organizationId)
          .in("ticket_id", ticketIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? admin
          .from("agent_steps")
          .select("session_id,kind,tool_name,result_summary,seq")
          .eq("organization_id", session.organizationId)
          .in("session_id", sessionIds)
          .order("seq", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? admin
          .from("agent_outcome_feedback")
          .select("session_id,verdict,created_at,free_text")
          .eq("organization_id", session.organizationId)
          .in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    orgEnvironment
      ? admin
          .from("ticket_investigation_turns")
          .select("ticket_id,question_ids")
          .eq("organization_id", session.organizationId)
          .gte("created_at", window.from)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [ticketResult, eventResult, actionResult, stepResult]) {
    if (result.error) throw result.error;
  }
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
        session.organizationId,
        "agent_sessions",
        "last_user_message",
        row.last_user_message
      ),
      resolutionSummary: await decryptAgentText(
        admin,
        session.organizationId,
        "agent_sessions",
        "resolution_summary",
        row.resolution_summary
      ),
      backingTicketId: row.backing_ticket_id,
      escalationTicketId: row.escalation_ticket_id,
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
      }>
    ).map(async (row) => ({
      sessionId: row.session_id,
      kind: row.kind,
      toolName: row.tool_name,
      resultSummary: await decryptAgentText(
        admin,
        session.organizationId,
        "agent_steps",
        "result_summary",
        row.result_summary
      ),
      seq: row.seq,
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
        session.organizationId,
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
        }>
      ).map((row) => ({
        id: row.id,
        status: row.status,
        resolvedAt: row.resolved_at,
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
        }>
      ).map((row) => ({
        ticketId: row.ticket_id,
        agentId: row.agent_id,
      })),
      steps,
      feedback,
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
