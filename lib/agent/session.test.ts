import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeUserHandoff: vi.fn(),
  createClient: vi.fn(),
  decryptAgentText: vi.fn(),
  createWorkflowTicket: vi.fn(),
  attachTicketAttachments: vi.fn(),
  enqueueNotification: vi.fn(),
  getIssueBySlug: vi.fn(),
  getIssueStepPolicies: vi.fn(),
}));

vi.mock("@/app/actions/tickets", () => ({
  createWorkflowTicket: mocks.createWorkflowTicket,
}));
vi.mock("@/lib/attachments/server", () => ({
  attachTicketAttachments: mocks.attachTicketAttachments,
}));
vi.mock("@/lib/tickets/handoff", () => ({
  completeUserHandoff: mocks.completeUserHandoff,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/security/ticket-crypto", () => ({
  decryptAgentText: mocks.decryptAgentText,
  encryptAgentTextForWrite: vi.fn(
    async (_admin, _org, _table, _column, value) => value
  ),
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

import {
  escalate,
  halt,
  handoffReasonFor,
  loadRequesterIdentifiers,
} from "./session";
import type { AgentSession } from "./types";

const session: AgentSession = {
  id: "session-1",
  organization_id: "org-1",
  requester_id: "requester-1",
  status: "active",
  started_at: "2026-09-28T00:00:00.000Z",
  ended_at: null,
  last_user_message: "Wi-Fi is still broken.",
  resolution_summary: null,
  escalation_ticket_id: null,
  backing_ticket_id: "ticket-1",
  action_count: 3,
  tool_call_count: 3,
  model_turn_count: 3,
  token_count: 0,
  halt_reason: null,
  security_flag: false,
  updated_at: "2026-09-28T00:00:00.000Z",
};

const actionSteps = Array.from({ length: 3 }, (_, index) => {
  const base = new Date(Date.UTC(2026, 8, 28, 0, index, 0)).toISOString();
  return [
    {
      kind: "action_executing",
      capability_id: "device_flush_dns",
      result_summary: "passed",
      created_at: base,
    },
    {
      kind: "verification_result",
      capability_id: "device_flush_dns",
      result_summary: "passed",
      created_at: new Date(Date.parse(base) + 1_000).toISOString(),
    },
    {
      kind: "user_feedback",
      capability_id: null,
      result_summary: "no",
      created_at: new Date(Date.parse(base) + 2_000).toISOString(),
    },
  ];
}).flat();

function makeAdmin(
  options: {
    actionInsertError?: Error;
    userStepRows?: Array<Record<string, unknown>>;
  } = {}
) {
  const insertedActions: unknown[] = [];
  const insertedSteps: unknown[] = [];
  const queries: Record<string, ReturnType<typeof makeQuery>> = {};
  const makeQuery = (table: string) => {
    let selection = "";
    const query = {
      select: vi.fn((value: string) => {
        selection = value;
        return query;
      }),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      not: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      insert: vi.fn((value: unknown) => {
        if (table === "ticket_actions" && Array.isArray(value))
          insertedActions.push(...value);
        else if (table === "ticket_actions" && value)
          insertedActions.push(value);
        if (table === "agent_steps") {
          insertedSteps.push(value);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "saved-step-id" },
                error: null,
              })),
            })),
          };
        }
        return Promise.resolve({ error: options.actionInsertError ?? null });
      }),
      update: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      single: vi.fn(async () => ({
        data: { id: "saved-step-id" },
        error: null,
      })),
      then: (resolve: (value: unknown) => unknown) => {
        let data: unknown = [];
        if (table === "agent_steps") {
          data =
            selection === "seq"
              ? { seq: actionSteps.length }
              : selection.includes("params_hash")
                ? (options.userStepRows ?? [])
                : selection.includes("capability_id")
                  ? actionSteps
                  : actionSteps.map((step) => ({
                      kind: step.kind,
                      tool_name: step.capability_id,
                    }));
        }
        if (table === "ticket_actions") data = [];
        if (table === "agent_sessions") data = [];
        return Promise.resolve({ data, error: null }).then(resolve);
      },
    };
    queries[table] = query;
    return query;
  };
  const admin = {
    from: vi.fn((table: string) => queries[table] ?? makeQuery(table)),
  };
  return { admin, insertedActions, insertedSteps };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mocks.decryptAgentText.mockImplementation(
    async (_admin, _org, _table, _column, value) => value
  );
  mocks.createClient.mockReturnValue({
    rpc: vi.fn(async () => ({ error: null })),
  });
  mocks.completeUserHandoff.mockResolvedValue(undefined);
  mocks.attachTicketAttachments.mockResolvedValue(undefined);
  mocks.enqueueNotification.mockResolvedValue(undefined);
  mocks.getIssueBySlug.mockReturnValue({
    id: "wifi-guide",
    title: "Wi-Fi keeps disconnecting",
  });
  mocks.getIssueStepPolicies.mockReturnValue([
    { text: "Restart the router." },
    { text: "Reconnect to the Wi-Fi network." },
    { text: "Check the cable connection." },
    { text: "Restart the device." },
    { text: "Ask IT for help." },
  ]);
});

describe("requester-agent escalation handoff reasons", () => {
  test.each([
    ["user_requested_human", "escalated", "user_requested_human"],
    ["max_failed_hypotheses", "escalated", "repeated_failure"],
    ["rollback_failed", "escalated", "repeated_failure"],
    ["verification_inconclusive", "escalated", "repeated_failure"],
    ["execution_denied", "escalated", "repeated_failure"],
    ["verification_failed", "escalated", "repeated_failure"],
    ["low_confidence", "escalated", "low_confidence"],
    ["security_tripwire", "escalated", "security_concern"],
    ["anything_else", "escalated", "agent_halted"],
    ["anything_else", "halted", "security_concern"],
    ["max_failed_hypotheses", "halted", "security_concern"],
  ] as const)("%s/%s maps to %s", (reason, status, expected) => {
    expect(handoffReasonFor(reason, status)).toBe(expected);
  });

  test("records attempted actions and maps repeated failure", async () => {
    vi.stubEnv("HELP_DESK_AGENT_USER_STEPS_ENABLED", "false");
    const { admin, insertedActions } = makeAdmin();
    const rpc = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockReturnValue({ rpc });

    await escalate(
      admin as never,
      session,
      "max_failed_hypotheses",
      "Still broken."
    );

    expect(insertedActions).toHaveLength(9);
    expect(
      insertedActions.map(
        (action) => (action as { tool_name: string }).tool_name
      )
    ).toEqual([
      "device_flush_dns",
      "device_flush_dns",
      "user_feedback",
      "device_flush_dns",
      "device_flush_dns",
      "user_feedback",
      "device_flush_dns",
      "device_flush_dns",
      "user_feedback",
    ]);
    expect(insertedActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_id: null,
          action_summary: "Ran device_flush_dns after requester approval",
          result_summary: "passed",
          approval_type: "user_consent",
          consent_required: true,
          consent_received: true,
        }),
        expect.objectContaining({
          action_summary: 'Requester asked "Is it working now?"',
          result_summary: "Requester reported still broken",
          consent_required: false,
          consent_received: false,
        }),
      ])
    );
    expect(rpc).toHaveBeenCalledWith("handoff_ticket", {
      ticket: "ticket-1",
      reason: "max_failed_hypotheses",
      handoff: "repeated_failure",
    });
  });

  test("maps a halt to a security handoff", async () => {
    const { admin } = makeAdmin();
    const rpc = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockReturnValue({ rpc });

    await halt(admin as never, session, "injection_detected", "Unsafe input.");

    expect(rpc).toHaveBeenCalledWith("handoff_ticket", {
      ticket: "ticket-1",
      reason: "injection_detected",
      handoff: "security_concern",
    });
  });

  test("continues escalation when ticket action recording fails", async () => {
    const { admin } = makeAdmin({
      actionInsertError: new Error("insert failed"),
    });
    const rpc = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockReturnValue({ rpc });

    await expect(
      escalate(
        admin as never,
        session,
        "max_failed_hypotheses",
        "Still broken."
      )
    ).resolves.toBe("ticket-1");
    expect(rpc).toHaveBeenCalled();
    expect(mocks.completeUserHandoff).toHaveBeenCalledWith("ticket-1");
  });

  test("adds user steps and notifies only pending unsaved steps when enabled", async () => {
    vi.stubEnv("HELP_DESK_AGENT_USER_STEPS_ENABLED", "true");
    const at = "2026-09-28T00:00:00.000Z";
    const userStepRows = [
      {
        id: "step-done",
        kind: "user_step_offered",
        params_hash: "wifi-guide#0",
        result_summary: JSON.stringify({ why: "Try this first." }),
        created_at: at,
      },
      {
        id: "done-outcome",
        kind: "user_step_outcome",
        params_hash: "step-done",
        result_summary: "done",
        created_at: at,
      },
      {
        id: "step-didnt-work",
        kind: "user_step_offered",
        params_hash: "wifi-guide#1",
        result_summary: JSON.stringify({ why: "This isolates the issue." }),
        created_at: at,
      },
      {
        id: "didnt-work-outcome",
        kind: "user_step_outcome",
        params_hash: "step-didnt-work",
        result_summary: "didnt_work",
        created_at: at,
      },
      {
        id: "step-cant-do",
        kind: "user_step_offered",
        params_hash: "wifi-guide#2",
        result_summary: JSON.stringify({ why: "Check this connection." }),
        created_at: at,
      },
      {
        id: "cant-do-outcome",
        kind: "user_step_outcome",
        params_hash: "step-cant-do",
        result_summary: "cant_do",
        created_at: at,
      },
      {
        id: "step-pending",
        kind: "user_step_offered",
        params_hash: "wifi-guide#3",
        result_summary: JSON.stringify({ why: "This may restore service." }),
        created_at: at,
      },
      {
        id: "step-already-saved",
        kind: "user_step_offered",
        params_hash: "wifi-guide#4",
        result_summary: JSON.stringify({ why: "Ask for help if needed." }),
        created_at: at,
      },
      {
        id: "saved-marker",
        kind: "user_step_saved",
        params_hash: "step-already-saved",
        result_summary: "pending",
        created_at: at,
      },
    ];
    const { admin, insertedActions, insertedSteps } = makeAdmin({
      userStepRows,
    });

    await escalate(admin as never, session, "user_requested_human", "Help.");

    const stepActions = insertedActions.filter(
      (action) => (action as { tool_name?: string }).tool_name === "user_step"
    );
    expect(stepActions).toHaveLength(5);
    expect(stepActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action_summary:
            "Your step: Restart the router. — Source: Wi-Fi keeps disconnecting",
          result_summary: "Requester did it",
        }),
        expect.objectContaining({
          action_summary:
            "Your step: Reconnect to the Wi-Fi network. — Source: Wi-Fi keeps disconnecting",
          result_summary: "Requester said it didn't work",
        }),
        expect.objectContaining({
          result_summary: "Requester couldn't do it",
        }),
        expect.objectContaining({
          result_summary: "Not done before the session ended",
        }),
      ])
    );
    expect(mocks.enqueueNotification).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: session.organization_id,
        ticketId: "ticket-1",
        eventType: "agent.user_step_pending",
        recipientUserIds: [session.requester_id],
        subject: "A step to try from your support chat",
        body: "Restart the device.\n\nThis may restore service.\n\nWi-Fi keeps disconnecting",
        url: "/tickets/ticket-1",
        dedupeKey: "user-step:step-pending",
      })
    );
    expect(insertedSteps).toContainEqual(
      expect.objectContaining({
        kind: "user_step_saved",
        params_hash: "step-pending",
      })
    );
  });
});

describe("loadRequesterIdentifiers", () => {
  function makeIdentifierAdmin(options: {
    userResult?: unknown;
    userError?: Error;
    deviceRows?: Array<{ hostname: string }>;
    deviceError?: Error;
  }) {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: options.deviceRows ?? [],
          error: options.deviceError ?? null,
        }).then(resolve),
    };
    const getUserById = options.userError
      ? vi.fn().mockRejectedValue(options.userError)
      : vi.fn().mockResolvedValue(
          options.userResult ?? {
            data: { user: { email: "Requester@Example.test" } },
            error: null,
          }
        );
    const from = vi.fn(() => query);
    return {
      admin: {
        auth: { admin: { getUserById } },
        from,
      } as never,
      getUserById,
      from,
      query,
    };
  }

  test("loads scoped active-device hostnames when requester lookup fails", async () => {
    const { admin, getUserById, from, query } = makeIdentifierAdmin({
      userError: new Error("auth lookup failed"),
      deviceRows: [{ hostname: "LAPTOP-OWN123" }],
    });

    await expect(loadRequesterIdentifiers(admin, session)).resolves.toEqual([
      "LAPTOP-OWN123",
    ]);
    expect(getUserById).toHaveBeenCalledWith("requester-1");
    expect(from).toHaveBeenCalledWith("devices_public");
    expect(query.select).toHaveBeenCalledWith("hostname");
    expect(query.eq).toHaveBeenNthCalledWith(1, "organization_id", "org-1");
    expect(query.eq).toHaveBeenNthCalledWith(2, "user_id", "requester-1");
    expect(query.eq).toHaveBeenNthCalledWith(3, "status", "active");
  });

  test("keeps the requester email when the device lookup fails", async () => {
    const { admin } = makeIdentifierAdmin({
      deviceError: new Error("device lookup failed"),
    });

    await expect(loadRequesterIdentifiers(admin, session)).resolves.toEqual([
      "requester@example.test",
    ]);
  });
});
