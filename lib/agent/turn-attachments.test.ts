import { beforeEach, describe, expect, test, vi } from "vitest";

const { attachMock, createTicketMock, handoffMock, intakeMock, rpcMock } =
  vi.hoisted(() => ({
    attachMock: vi.fn(),
    createTicketMock: vi.fn(),
    handoffMock: vi.fn(),
    intakeMock: vi.fn(),
    rpcMock: vi.fn(),
  }));

vi.mock("@/app/actions/tickets", () => ({
  createWorkflowTicket: createTicketMock,
}));
vi.mock("@/lib/attachments/server", () => ({
  attachTicketAttachments: attachMock,
}));
vi.mock("@/lib/tickets/handoff", () => ({
  completeUserHandoff: handoffMock,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: rpcMock })),
}));
vi.mock("@/lib/security/ticket-crypto", () => ({
  encryptAgentTextForWrite: vi.fn(
    async (_admin, _org, _table, _column, value) => value
  ),
  decryptAgentText: vi.fn(
    async (_admin, _org, _table, _column, value) => value
  ),
}));

import { handleAgentRequest } from "./turn";
import type { AgentEvent, AgentSession } from "./types";

const session: AgentSession = {
  id: "00000000-0000-4000-8000-000000000001",
  organization_id: "00000000-0000-4000-8000-000000000002",
  requester_id: "00000000-0000-4000-8000-000000000003",
  status: "active",
  started_at: new Date().toISOString(),
  ended_at: null,
  last_user_message: null,
  resolution_summary: null,
  escalation_ticket_id: null,
  action_count: 0,
  tool_call_count: 0,
  model_turn_count: 0,
  token_count: 0,
  halt_reason: null,
  security_flag: false,
  updated_at: new Date().toISOString(),
};

function adminForScreenshotSteps() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        in: () => query,
        not: () => query,
        order: () => query,
        limit: () => query,
        insert: () => query,
        update: () => query,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({
          data: { id: "00000000-0000-4000-8000-000000000020" },
          error: null,
        }),
        get data() {
          if (table === "agent_steps" && filters.kind === "screenshot_received")
            return [{ attachment_id: "00000000-0000-4000-8000-000000000010" }];
          return [];
        },
        get error() {
          return null;
        },
      };
      return query;
    },
  } as never;
}

describe("requester agent screenshot escalation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createTicketMock.mockResolvedValue({ ticketId: "ticket-1" });
    attachMock.mockResolvedValue({ success: true });
    handoffMock.mockResolvedValue(undefined);
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  test("intakes screenshots before human escalation and binds them to the ticket", async () => {
    const events: AgentEvent[] = [];
    const steps: Array<Record<string, unknown>> = [];
    intakeMock.mockResolvedValue({
      ok: true,
      items: [
        {
          attachmentId: "00000000-0000-4000-8000-000000000010",
          modelText:
            '<untrusted_data source="screenshot">error</untrusted_data>',
          userSummary: "An error dialog is visible.",
          sha256: "hash",
        },
      ],
    });
    attachMock.mockImplementation(async () => {
      expect(steps[0]).toMatchObject({ kind: "screenshot_received" });
      return { success: true };
    });

    const admin = adminForScreenshotSteps();
    const requestSession = { ...session };
    await handleAgentRequest({
      admin,
      session: requestSession,
      message: "Please have a human look at this.",
      humanRequested: true,
      attachmentIds: ["00000000-0000-4000-8000-000000000010"],
      emit: (event) => events.push(event),
      signal: new AbortController().signal,
      deps: {
        writeStep: async (_admin, _session, step) => {
          steps.push(step);
          return null;
        },
        intakeScreenshots: intakeMock,
      },
    });

    expect(intakeMock).toHaveBeenCalledWith(
      admin,
      requestSession,
      ["00000000-0000-4000-8000-000000000010"],
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(steps[0]).toMatchObject({
      kind: "screenshot_received",
      attachmentId: "00000000-0000-4000-8000-000000000010",
    });
    expect(events).toContainEqual({
      type: "screenshot_received",
      attachmentId: "00000000-0000-4000-8000-000000000010",
      summary: "An error dialog is visible.",
    });
    expect(attachMock).toHaveBeenCalledWith("ticket-1", [
      "00000000-0000-4000-8000-000000000010",
    ]);
  });
});
