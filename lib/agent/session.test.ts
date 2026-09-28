import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeUserHandoff: vi.fn(),
  createClient: vi.fn(),
  decryptAgentText: vi.fn(),
  createWorkflowTicket: vi.fn(),
  attachTicketAttachments: vi.fn(),
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

import { escalate, halt, handoffReasonFor } from "./session";
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

function makeAdmin(options: { actionInsertError?: Error } = {}) {
  const insertedActions: unknown[] = [];
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
      insert: vi.fn(async (value: unknown) => {
        if (table === "ticket_actions" && Array.isArray(value))
          insertedActions.push(...value);
        return { error: options.actionInsertError ?? null };
      }),
      update: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      then: (resolve: (value: unknown) => unknown) => {
        let data: unknown = [];
        if (table === "agent_steps") {
          data =
            selection === "seq"
              ? { seq: actionSteps.length }
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
  return { admin, insertedActions };
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.decryptAgentText.mockImplementation(
    async (_admin, _org, _table, _column, value) => value
  );
  mocks.createClient.mockReturnValue({
    rpc: vi.fn(async () => ({ error: null })),
  });
  mocks.completeUserHandoff.mockResolvedValue(undefined);
  mocks.attachTicketAttachments.mockResolvedValue(undefined);
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
});
