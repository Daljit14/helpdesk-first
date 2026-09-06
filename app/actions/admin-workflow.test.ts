import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
  createAdminClient: vi.fn(),
  sendPushToUser: vi.fn(),
  notifyEmployeesOfHandoff: vi.fn(),
}));

vi.mock("@/lib/admin/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/auth")>(
      "@/lib/admin/auth"
    );
  return {
    ...actual,
    getAdminSession: mocks.getAdminSession,
    recordAudit: mocks.recordAudit,
  };
});
vi.mock("@/lib/admin/flags", () => ({
  isTicketWorkflowEnabled: vi.fn(() => true),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/push/send", () => ({
  sendPushToUser: mocks.sendPushToUser,
}));
vi.mock("@/lib/tickets/notify", () => ({
  notifyEmployeesOfHandoff: mocks.notifyEmployeesOfHandoff,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addInternalNote,
  addPublicComment,
  assignTicket,
  changeStatus,
  claimTicket,
  recordAction,
  submitResolution,
} from "./admin-workflow";

const ticketId = "00000000-0000-4000-8000-000000000001";
const agentId = "00000000-0000-4000-8000-000000000002";
const session = {
  userId: "00000000-0000-4000-8000-000000000010",
  email: "admin@example.com",
  role: "admin" as const,
  organizationId: "org-1",
  displayName: "Admin",
};

function setup({
  ticket = {},
  member = { user_id: agentId, role: "support_agent" },
  profile = { display_name: "Support Agent" },
  updateData = { id: ticketId },
}: {
  ticket?: Record<string, unknown>;
  member?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  updateData?: Record<string, unknown> | null;
} = {}) {
  const baseTicket = {
    id: ticketId,
    organization_id: "org-1",
    assigned_agent_id: null,
    status: "Needs Human",
    priority: "Normal",
    issue_title: "No internet",
    user_id: "user-1",
    first_human_response_at: null,
    needs_human_at: null,
    handoff_reason: null,
    ...ticket,
  };
  const updates: unknown[] = [];
  const events: unknown[] = [];
  const inserts: Record<string, unknown>[] = [];
  const ticketBuilder = {
    select: vi.fn(() => ticketBuilder),
    eq: vi.fn(() => ticketBuilder),
    update: vi.fn((values: unknown) => {
      updates.push(values);
      return ticketBuilder;
    }),
    maybeSingle: vi.fn(async () => ({
      data: updates.length ? updateData : baseTicket,
      error: null,
    })),
  };
  const memberBuilder = {
    select: vi.fn(() => memberBuilder),
    eq: vi.fn(() => memberBuilder),
    in: vi.fn(() => memberBuilder),
    maybeSingle: vi.fn(async () => ({ data: member, error: null })),
  };
  const profileBuilder = {
    select: vi.fn(() => profileBuilder),
    eq: vi.fn(() => profileBuilder),
    maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
  };
  const insertBuilder = (table: string) => ({
    insert: vi.fn((value: Record<string, unknown>) => {
      inserts.push({ table, ...value });
      if (table === "ticket_system_events") events.push(value);
      return Promise.resolve({ error: null });
    }),
  });
  mocks.createAdminClient.mockImplementation(() => ({
    from: vi.fn((table: string) => {
      if (table === "tickets") return ticketBuilder;
      if (table === "organization_members") return memberBuilder;
      if (table === "admin_profiles") return profileBuilder;
      return insertBuilder(table);
    }),
  }));
  return { ticketBuilder, updates, events, inserts };
}

afterEach(() => vi.clearAllMocks());

describe("admin workflow actions", () => {
  test("claims an unassigned ticket, writes an event, and audits", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    const { updates, events } = setup();

    await expect(claimTicket(ticketId)).resolves.toEqual({ success: true });
    expect(updates[0]).toEqual(
      expect.objectContaining({
        assigned_agent_id: session.userId,
        status: "In Progress",
      })
    );
    expect(events).toEqual([
      expect.objectContaining({ event_type: "employee.claimed" }),
    ]);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      session,
      "ticket.claim",
      ticketId
    );
  });

  test("rejects claiming an assigned ticket", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    const { updates } = setup({ ticket: { assigned_agent_id: agentId } });
    await expect(claimTicket(ticketId)).resolves.toEqual({
      error: "Ticket is already assigned.",
    });
    expect(updates).toHaveLength(0);
  });

  test("rejects a ticket from another organization before updating", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    const { updates } = setup({ ticket: { organization_id: "org-2" } });
    await expect(claimTicket(ticketId)).resolves.toEqual({
      error: "Ticket not found.",
    });
    expect(updates).toHaveLength(0);
  });

  test("rejects a support agent viewing another agent ticket", async () => {
    mocks.getAdminSession.mockResolvedValue({
      ...session,
      role: "support_agent",
      userId: "agent-1",
    });
    setup({ ticket: { assigned_agent_id: "agent-2", status: "In Progress" } });
    await expect(claimTicket(ticketId)).resolves.toEqual({
      error: "Ticket not found.",
    });
  });

  test("requires every resolution field and never updates invalid reports", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    const { updates } = setup();
    await expect(
      submitResolution(ticketId, { rootCause: "Only one field" })
    ).resolves.toEqual({ error: "Complete every resolution field." });
    expect(updates).toHaveLength(0);
  });

  test("submits resolution as pending verification", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    const { updates } = setup();
    await expect(
      submitResolution(ticketId, {
        rootCause: "DNS cache",
        actionsPerformed: "Flushed DNS cache",
        toolsUsed: "Terminal",
        result: "Internet restored",
        verificationMethod: "remote_test",
        userExplanation: "The connection is restored.",
        preventiveRecommendation: "Restart the router monthly.",
      })
    ).resolves.toEqual({ success: true });
    expect(updates[0]).toEqual(
      expect.objectContaining({ status: "Pending Verification" })
    );
    expect(updates).not.toContainEqual(
      expect.objectContaining({ status: "Resolved" })
    );
  });

  test("rejects manual resolved status", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    setup();
    await expect(changeStatus(ticketId, "Resolved")).resolves.toEqual({
      error: "Invalid status.",
    });
  });

  test("adds an internal note without sending a push", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    const { events, inserts } = setup();
    await expect(
      addInternalNote(ticketId, "Internal investigation note")
    ).resolves.toEqual({
      success: true,
    });
    expect(inserts).toContainEqual(
      expect.objectContaining({ visibility: "internal" })
    );
    expect(events).toEqual([
      expect.objectContaining({ event_type: "internal_note.created" }),
    ]);
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });

  test("adds a public comment and pushes the ticket owner", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    setup();
    await expect(addPublicComment(ticketId, "A public reply")).resolves.toEqual(
      {
        success: true,
      }
    );
    expect(mocks.sendPushToUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ title: "Your ticket has a new reply" })
    );
  });

  test("rejects credentials in recorded actions", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    const { inserts } = setup();
    await expect(
      recordAction({
        ticketId,
        toolName: "Terminal",
        actionSummary: "password=abc",
        resultSummary: "Done",
        consentRequired: false,
        consentReceived: false,
      })
    ).resolves.toEqual({ error: "Remove credentials from the record." });
    expect(inserts).toHaveLength(0);
  });

  test("records a safe action and emits tool.used", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    const { inserts, events } = setup();
    await expect(
      recordAction({
        ticketId,
        toolName: "Microsoft 365 Service Health",
        actionSummary: "Checked Outlook service availability.",
        resultSummary: "No organization-wide outage found.",
        consentRequired: false,
        consentReceived: false,
      })
    ).resolves.toEqual({ success: true });
    expect(inserts).toContainEqual(
      expect.objectContaining({ tool_name: "Microsoft 365 Service Health" })
    );
    expect(events).toEqual([
      expect.objectContaining({ event_type: "tool.used" }),
    ]);
  });

  test("does not let support agents assign tickets", async () => {
    mocks.getAdminSession.mockResolvedValue({
      ...session,
      role: "support_agent",
    });
    setup();
    await expect(assignTicket(ticketId, agentId)).resolves.toEqual({
      error: "Ticket not found.",
    });
  });
});
