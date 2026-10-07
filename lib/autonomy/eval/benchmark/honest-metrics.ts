import {
  computeAutonomyMetrics,
  type AutonomyMetricsInput,
  type HonestMetrics,
  type HonestOutcome,
} from "@/lib/analytics/autonomy-metrics";

export const honestMetricsScenarios = [
  "abandoned",
  "pending_72h",
  "staff_touched_after_resolve",
  "same_requester_24h_rereport",
  "came_back_feedback",
  "mixed",
] as const;

export type HonestMetricsScenario = (typeof honestMetricsScenarios)[number];

const window = {
  windowDays: 30,
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T23:59:59.999Z",
};

function session(
  id: string,
  overrides: Partial<AutonomyMetricsInput["sessions"][number]> = {}
): AutonomyMetricsInput["sessions"][number] {
  return {
    id,
    requesterId: `requester-${id}`,
    status: "resolved",
    startedAt: "2026-01-20T10:00:00.000Z",
    endedAt: "2026-01-20T11:00:00.000Z",
    userConfirmedAt: "2026-01-20T11:30:00.000Z",
    lastUserMessage: "Support request",
    resolutionSummary: null,
    backingTicketId: `ticket-${id}`,
    escalationTicketId: null,
    ...overrides,
  };
}

function fixture(
  sessions: AutonomyMetricsInput["sessions"],
  overrides: Partial<AutonomyMetricsInput> = {}
): AutonomyMetricsInput {
  return {
    sessions,
    tickets: sessions.map((item) => ({
      id: item.backingTicketId ?? `ticket-${item.id}`,
      status: "Resolved",
      resolvedAt: item.endedAt,
      category: "network",
    })),
    systemEvents: [],
    actions: [],
    steps: [],
    ...overrides,
  };
}

function outcomeExpectations(scenario: HonestMetricsScenario): {
  input: AutonomyMetricsInput;
  outcomes: Record<string, HonestOutcome>;
  summary?: Partial<
    Pick<
      HonestMetrics,
      | "sessions"
      | "aiResolved"
      | "aiResolutionRate"
      | "falseResolved"
      | "falseResolvedRate"
      | "deflected"
      | "deflectionRate"
      | "abandoned"
      | "abandonmentRate"
    >
  >;
} {
  const pendingEnd = new Date(
    Date.parse(window.to) - 72 * 60 * 60_000 + 1
  ).toISOString();
  switch (scenario) {
    case "abandoned":
      return {
        input: fixture([session("abandoned", { status: "abandoned" })]),
        outcomes: { abandoned: "abandoned" },
      };
    case "pending_72h":
      return {
        input: fixture([
          session("pending", {
            startedAt: new Date(Date.parse(pendingEnd) - 60_000).toISOString(),
            endedAt: pendingEnd,
            userConfirmedAt: null,
          }),
        ]),
        outcomes: { pending: "pending" },
      };
    case "staff_touched_after_resolve":
      return {
        input: fixture(
          [
            session("staff", {
              endedAt: "2026-01-30T10:00:00.000Z",
              userConfirmedAt: "2026-01-30T10:30:00.000Z",
            }),
          ],
          {
            systemEvents: [
              {
                ticketId: "ticket-staff",
                eventType: "comment.created",
                actorType: "employee",
                createdAt: "2026-01-30T10:01:00.000Z",
              },
            ],
          }
        ),
        outcomes: { staff: "staff_touched" },
      };
    case "same_requester_24h_rereport":
      return {
        input: fixture([
          session("repeat-original", {
            requesterId: "requester-repeat",
            startedAt: "2026-01-29T10:00:00.000Z",
            endedAt: "2026-01-29T11:00:00.000Z",
            userConfirmedAt: "2026-01-29T11:30:00.000Z",
          }),
          session("repeat-report", {
            requesterId: "requester-repeat",
            status: "abandoned",
            startedAt: "2026-01-30T10:00:00.000Z",
            endedAt: "2026-01-30T10:01:00.000Z",
            userConfirmedAt: null,
          }),
        ]),
        outcomes: {
          "repeat-original": "false_resolved",
          "repeat-report": "abandoned",
        },
      };
    case "came_back_feedback":
      return {
        input: fixture(
          [
            session("came-back", {
              endedAt: "2026-01-30T10:00:00.000Z",
              userConfirmedAt: "2026-01-30T10:30:00.000Z",
            }),
          ],
          {
            feedback: [
              {
                sessionId: "came-back",
                verdict: "came_back",
                createdAt: "2026-01-30T12:00:00.000Z",
                text: null,
              },
            ],
          }
        ),
        outcomes: { "came-back": "false_resolved" },
      };
    case "mixed":
      return {
        input: fixture(
          [
            session("mixed-abandoned", { status: "abandoned" }),
            session("mixed-pending", {
              startedAt: new Date(
                Date.parse(pendingEnd) - 60_000
              ).toISOString(),
              endedAt: pendingEnd,
              userConfirmedAt: null,
            }),
            session("mixed-staff", {
              endedAt: "2026-01-30T10:00:00.000Z",
            }),
            session("mixed-repeat-original", {
              requesterId: "requester-mixed-repeat",
              startedAt: "2026-01-29T10:00:00.000Z",
              endedAt: "2026-01-29T11:00:00.000Z",
            }),
            session("mixed-repeat-report", {
              requesterId: "requester-mixed-repeat",
              status: "abandoned",
              startedAt: "2026-01-30T10:00:00.000Z",
              endedAt: "2026-01-30T10:01:00.000Z",
            }),
            session("mixed-came-back", {
              endedAt: "2026-01-30T10:00:00.000Z",
            }),
            session("mixed-ai", {
              requesterId: "requester-mixed-ai",
              startedAt: "2026-01-15T10:00:00.000Z",
              endedAt: "2026-01-15T11:00:00.000Z",
            }),
          ],
          {
            systemEvents: [
              {
                ticketId: "ticket-mixed-staff",
                eventType: "comment.created",
                actorType: "employee",
                createdAt: "2026-01-30T10:01:00.000Z",
              },
            ],
            feedback: [
              {
                sessionId: "mixed-came-back",
                verdict: "came_back",
                createdAt: "2026-01-30T12:00:00.000Z",
                text: null,
              },
            ],
          }
        ),
        outcomes: {
          "mixed-abandoned": "abandoned",
          "mixed-pending": "pending",
          "mixed-staff": "staff_touched",
          "mixed-repeat-original": "false_resolved",
          "mixed-repeat-report": "abandoned",
          "mixed-came-back": "false_resolved",
          "mixed-ai": "ai_resolved",
        },
        summary: {
          sessions: 7,
          aiResolved: 1,
          aiResolutionRate: 1 / 7,
          falseResolved: 2,
          falseResolvedRate: 2 / 3,
          deflected: 6,
          deflectionRate: 6 / 7,
          abandoned: 2,
          abandonmentRate: 2 / 7,
        },
      };
  }
}

export function runHonestMetricsScenario(scenario: HonestMetricsScenario): {
  testPassed: boolean;
  countedResolvedIds: string[];
  fixtureStatuses: Record<string, string>;
} {
  const expected = outcomeExpectations(scenario);
  const metrics = computeAutonomyMetrics(expected.input, window).v2;
  const actual = new Map(
    metrics.sessionOutcomes.map(({ sessionId, outcome }) => [
      sessionId,
      outcome,
    ])
  );
  const summaryPassed = Object.entries(expected.summary ?? {}).every(
    ([key, value]) => metrics[key as keyof HonestMetrics] === value
  );
  const testPassed =
    Object.keys(expected.outcomes).length === metrics.sessionOutcomes.length &&
    Object.entries(expected.outcomes).every(
      ([sessionId, outcome]) => actual.get(sessionId) === outcome
    ) &&
    summaryPassed;
  return {
    testPassed,
    countedResolvedIds: metrics.sessionOutcomes
      .filter(({ outcome }) => outcome === "ai_resolved")
      .map(({ sessionId }) => sessionId),
    fixtureStatuses: Object.fromEntries(
      expected.input.sessions.map(({ id, status }) => [id, status])
    ),
  };
}
