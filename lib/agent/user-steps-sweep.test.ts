import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decryptAgentText: vi.fn(),
  enqueueNotification: vi.fn(),
  getIssueBySlug: vi.fn(),
  getIssueStepPolicies: vi.fn(),
  writeStep: vi.fn(),
}));

vi.mock("@/lib/security/ticket-crypto", () => ({
  decryptAgentText: mocks.decryptAgentText,
}));
vi.mock("@/lib/notifications/enqueue", () => ({
  enqueueNotification: mocks.enqueueNotification,
}));
vi.mock("@/lib/search", () => ({
  getIssueBySlug: mocks.getIssueBySlug,
}));
vi.mock("@/lib/investigation/policy", () => ({
  getIssueStepPolicies: mocks.getIssueStepPolicies,
}));
vi.mock("./session", () => ({
  writeStep: mocks.writeStep,
}));

import { sweepPendingUserSteps } from "./user-steps-sweep";
import type { AgentSession } from "./types";

const session: AgentSession = {
  id: "session-1",
  organization_id: "org-1",
  requester_id: "requester-1",
  status: "active",
  started_at: "2026-10-01T00:00:00.000Z",
  ended_at: null,
  last_user_message: null,
  resolution_summary: null,
  escalation_ticket_id: null,
  backing_ticket_id: "ticket-1",
  action_count: 0,
  tool_call_count: 1,
  model_turn_count: 2,
  token_count: 0,
  halt_reason: null,
  security_flag: false,
  updated_at: "2026-10-01T00:00:00.000Z",
};

function makeAdmin(
  options: {
    sessions?: AgentSession[];
    stepSessionIds?: string[];
    steps?: Array<Record<string, unknown>>;
    events?: string[];
  } = {}
) {
  const filters: Array<[string, unknown]> = [];
  const actions: unknown[] = [];
  const events = options.events ?? [];
  const stepSessionIds =
    options.stepSessionIds ??
    ((options.steps?.length ?? 0) > 0
      ? (options.sessions ?? []).map((item) => item.id)
      : []);
  const admin = {
    from: vi.fn((table: string) => {
      let selectedColumns: string | undefined;
      let sessionIds: string[] | undefined;
      const query = {
        select(columns?: string) {
          selectedColumns = columns;
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([`${table}.${column}`, value]);
          return query;
        },
        lt(column: string, value: unknown) {
          filters.push([`${table}.${column}`, value]);
          return query;
        },
        in(column: string, value: unknown) {
          filters.push([`${table}.${column}`, value]);
          if (
            table === "agent_sessions" &&
            column === "id" &&
            Array.isArray(value)
          )
            sessionIds = value as string[];
          return query;
        },
        gte(column: string, value: unknown) {
          filters.push([`${table}.${column}`, value]);
          return query;
        },
        order() {
          return query;
        },
        limit(value: number) {
          filters.push([`${table}.limit`, value]);
          return query;
        },
        insert(value: unknown) {
          actions.push(value);
          events.push("action");
          return Promise.resolve({ error: null });
        },
        then(resolve: (value: unknown) => unknown) {
          const data =
            table === "agent_sessions"
              ? (options.sessions ?? []).filter(
                  (item) => !sessionIds || sessionIds.includes(item.id)
                )
              : table === "agent_steps"
                ? selectedColumns === "session_id"
                  ? stepSessionIds.map((session_id) => ({ session_id }))
                  : (options.steps ?? [])
                : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    }),
  };
  return { admin, actions, events, filters };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.decryptAgentText.mockImplementation(
    async (_admin, _org, _table, _column, value) => value
  );
  mocks.enqueueNotification.mockResolvedValue(undefined);
  mocks.getIssueBySlug.mockReturnValue({
    id: "wifi-guide",
    title: "Wi-Fi keeps disconnecting",
  });
  mocks.getIssueStepPolicies.mockReturnValue([{ text: "Restart the router." }]);
  mocks.writeStep.mockImplementation(async () => {
    return "saved-step";
  });
});

describe("pending user-step sweep", () => {
  test("saves pending steps before creating actions and notifications", async () => {
    const events: string[] = [];
    const { admin, actions, filters } = makeAdmin({
      sessions: [session],
      steps: [
        {
          id: "step-1",
          kind: "user_step_offered",
          params_hash: "wifi-guide#0",
          result_summary: JSON.stringify({
            why: "This may resolve the issue.",
          }),
          created_at: "2026-10-01T00:00:00.000Z",
        },
      ],
      events,
    });
    mocks.writeStep.mockImplementation(async (_admin, _session, step) => {
      events.push("saved");
      expect(step).toMatchObject({
        kind: "user_step_saved",
        paramsHash: "step-1",
      });
      return "saved-step";
    });
    mocks.enqueueNotification.mockImplementation(async () => {
      events.push("notification");
    });

    await expect(
      sweepPendingUserSteps(admin as never, new Date("2026-10-01T01:00:00Z"))
    ).resolves.toEqual({ sessionsScanned: 1, stepsSaved: 1, failed: 0 });

    expect(filters).toContainEqual(["agent_sessions.status", "active"]);
    expect(filters).toContainEqual([
      "agent_sessions.updated_at",
      "2026-10-01T00:30:00.000Z",
    ]);
    expect(filters).toContainEqual(["agent_steps.kind", "user_step_offered"]);
    expect(filters).toContainEqual([
      "agent_steps.created_at",
      "2026-09-24T01:00:00.000Z",
    ]);
    expect(filters).toContainEqual(["agent_steps.limit", 200]);
    expect(filters).toContainEqual(["agent_sessions.id", ["session-1"]]);
    expect(events).toEqual(["saved", "action", "notification"]);
    expect(actions).toEqual([
      expect.objectContaining({
        ticket_id: "ticket-1",
        tool_name: "user_step",
        action_summary:
          "Your step: Restart the router. — Source: Wi-Fi keeps disconnecting",
        result_summary: "Not done before the session ended",
      }),
    ]);
    expect(mocks.enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        ticketId: "ticket-1",
        eventType: "agent.user_step_pending",
        recipientUserIds: ["requester-1"],
        subject: "A step to try from your support chat",
        body: "Restart the router.\n\nThis may resolve the issue.\n\nWi-Fi keeps disconnecting",
        url: "/tickets/ticket-1",
        dedupeKey: "user-step:step-1",
      })
    );
  });

  test("does not resave answered or already-saved step cards", async () => {
    const { admin, actions } = makeAdmin({
      sessions: [{ ...session, backing_ticket_id: null }],
      steps: [
        {
          id: "answered-step",
          kind: "user_step_offered",
          params_hash: "wifi-guide#0",
          result_summary: JSON.stringify({ why: "Already completed." }),
          created_at: "2026-10-01T00:00:00.000Z",
        },
        {
          id: "answered-row",
          kind: "user_step_outcome",
          params_hash: "answered-step",
          result_summary: "done",
          created_at: "2026-10-01T00:01:00.000Z",
        },
        {
          id: "saved-step",
          kind: "user_step_offered",
          params_hash: "wifi-guide#0",
          result_summary: JSON.stringify({ why: "Already saved." }),
          created_at: "2026-10-01T00:02:00.000Z",
        },
        {
          id: "saved-row",
          kind: "user_step_saved",
          params_hash: "saved-step",
          result_summary: "pending",
          created_at: "2026-10-01T00:03:00.000Z",
        },
      ],
    });

    await expect(
      sweepPendingUserSteps(admin as never, new Date("2026-10-01T01:00:00Z"))
    ).resolves.toEqual({ sessionsScanned: 1, stepsSaved: 0, failed: 0 });
    expect(mocks.writeStep).not.toHaveBeenCalled();
    expect(mocks.enqueueNotification).not.toHaveBeenCalled();
    expect(actions).toHaveLength(0);
  });

  test("sweeps pending steps despite many stale sessions without steps", async () => {
    const pendingSession: AgentSession = {
      ...session,
      id: "pending-session",
    };
    const staleStepLessSessions = Array.from({ length: 150 }, (_, index) => ({
      ...session,
      id: `step-less-${index}`,
    }));
    const { admin, filters } = makeAdmin({
      sessions: [...staleStepLessSessions, pendingSession],
      stepSessionIds: [pendingSession.id],
      steps: [
        {
          id: "pending-offer",
          kind: "user_step_offered",
          params_hash: "wifi-guide#0",
          result_summary: JSON.stringify({ why: "Try this step." }),
          created_at: "2026-10-01T00:00:00.000Z",
        },
      ],
    });

    await expect(
      sweepPendingUserSteps(admin as never, new Date("2026-10-01T01:00:00Z"))
    ).resolves.toEqual({ sessionsScanned: 1, stepsSaved: 1, failed: 0 });

    expect(filters).toContainEqual(["agent_sessions.id", [pendingSession.id]]);
    expect(filters).toContainEqual(["agent_steps.limit", 200]);
    expect(filters).not.toContainEqual(["agent_sessions.limit", 100]);
    expect(mocks.writeStep).toHaveBeenCalledTimes(1);
  });
});
