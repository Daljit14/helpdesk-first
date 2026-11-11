import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSmartIntakeEnabled: vi.fn(() => true),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  triageWorkflowTicket: vi.fn(async () => undefined),
  ticket: {} as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/admin/flags", () => ({
  isTicketWorkflowEnabled: vi.fn(() => true),
  isUserPortalEnabled: vi.fn(() => true),
  isSecureAttachmentsEnabled: vi.fn(() => false),
  isSmartIntakeEnabled: mocks.isSmartIntakeEnabled,
}));
vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/tickets/triage", () => ({
  triageWorkflowTicket: mocks.triageWorkflowTicket,
}));
vi.mock("@/lib/tickets/notify", () => ({
  notifyAssignedStaff: vi.fn(async () => undefined),
  notifyRequester: vi.fn(async () => undefined),
  notifyEmployeesOfHandoff: vi.fn(async () => undefined),
}));
vi.mock("@/lib/tickets/events", () => ({
  event: vi.fn(async () => undefined),
}));
vi.mock("@/lib/security/ticket-crypto", () => ({
  DataProtectionError: class extends Error {},
  encryptCommentForWrite: vi.fn(
    async (_a: unknown, _o: unknown, text: string) => text
  ),
  encryptTicketForWrite: vi.fn(
    async (_a: unknown, _o: unknown, text: string) => text
  ),
  decryptTicketRow: vi.fn(async (_a: unknown, row: unknown) => row),
  decryptCommentRows: vi.fn(async (_a: unknown, rows: unknown) => rows),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({
  after: vi.fn((callback: () => unknown) => callback()),
}));

import { addUserComment } from "./tickets";

const ticketId = "00000000-0000-4000-8000-000000000001";

function setup(
  ticket: Record<string, unknown>,
  questionIds = ["error-message"]
) {
  mocks.ticket = ticket;
  mocks.updates = [];
  mocks.createClient.mockResolvedValue({
    from: () => ({ insert: async () => ({ error: null }) }),
  });
  mocks.createAdminClient.mockReturnValue({
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order", "limit"])
        query[method] = () => query;
      query.update = (value: Record<string, unknown>) => {
        mocks.updates.push(value);
        return query;
      };
      query.maybeSingle = async () => {
        if (table === "ticket_system_events")
          return { data: { detail: { questionIds } }, error: null };
        if (mocks.updates.length > 0)
          return { data: { id: ticketId }, error: null };
        return { data: mocks.ticket, error: null };
      };
      return query;
    },
  });
}

const waiting = {
  id: ticketId,
  organization_id: "org-1",
  issue_title: "IT support request",
  assigned_agent_id: null,
  status: "Waiting for User",
  ai_question_count: 2,
  issue_id: "workflow-intake",
  platform: "Windows",
  message: "Something is broken",
  diagnostic_answers: [{ questionId: "which-platform", answer: "Windows" }],
  human_response_due_at: "2026-01-01T00:00:00.000Z",
};

afterEach(() => {
  vi.clearAllMocks();
  mocks.isSmartIntakeEnabled.mockReturnValue(true);
});

describe("addUserComment smart intake", () => {
  test("stores the reply as answers and re-runs triage", async () => {
    setup(waiting, ["error-message", "when-started"]);
    await expect(
      addUserComment(ticketId, "Error 0x1 since Monday")
    ).resolves.toEqual({
      success: true,
    });
    expect(mocks.updates).toEqual([
      {
        status: "AI Reviewing",
        diagnostic_answers: [
          { questionId: "which-platform", answer: "Windows" },
          { questionId: "error-message", answer: "Error 0x1 since Monday" },
          { questionId: "when-started", answer: "Error 0x1 since Monday" },
        ],
      },
    ]);
    expect(mocks.triageWorkflowTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId,
        organizationId: "org-1",
        message: "Something is broken",
        clarifyRound: 2,
      })
    );
  });

  test("does nothing extra when the flag is off or staff own the ticket", async () => {
    mocks.isSmartIntakeEnabled.mockReturnValue(false);
    setup(waiting);
    await addUserComment(ticketId, "More detail");
    mocks.isSmartIntakeEnabled.mockReturnValue(true);
    setup({ ...waiting, assigned_agent_id: "staff-1" });
    await addUserComment(ticketId, "More detail");
    setup({ ...waiting, status: "In Progress" });
    await addUserComment(ticketId, "More detail");
    expect(mocks.updates).toEqual([]);
    expect(mocks.triageWorkflowTicket).not.toHaveBeenCalled();
  });
});
