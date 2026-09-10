import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
  createAdminClient: vi.fn(),
  sendPushToUser: vi.fn(),
  notifyEmployeesOfHandoff: vi.fn(),
  notifyRequester: vi.fn(),
  notifyAssignedStaff: vi.fn(),
  getOrganizationPolicy: vi.fn(),
  createKnowledgeDraftForTicket: vi.fn(),
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
  notifyRequester: mocks.notifyRequester,
  notifyAssignedStaff: mocks.notifyAssignedStaff,
}));
vi.mock("@/lib/admin/policies", () => ({
  getOrganizationPolicy: mocks.getOrganizationPolicy,
}));
vi.mock("@/lib/knowledge/learning", () => ({
  createKnowledgeDraftForTicket: mocks.createKnowledgeDraftForTicket,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addInternalNote,
  addPublicComment,
  assignTicket,
  changeStatus,
  claimTicket,
  recordAction,
  reopenTicket,
  submitResolution,
} from "./admin-workflow";

const ticketId = "00000000-0000-4000-8000-000000000001";
const agentId = "00000000-0000-4000-8000-000000000002";
const session = {
  userId: "00000000-0000-4000-8000-000000000010",
  email: "admin@example.com",
  role: "org_admin" as const,
  isPlatformAdmin: false,
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

  test("submits user-confirmed resolution as pending verification", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    const { updates } = setup();
    await expect(
      submitResolution(ticketId, {
        rootCause: "DNS cache",
        actionsPerformed: "Flushed DNS cache",
        toolsUsed: "Terminal",
        result: "Internet restored",
        verificationMethod: "user_confirmed",
        userExplanation: "The connection is restored.",
        preventiveRecommendation: "Restart the router monthly.",
      })
    ).resolves.toEqual({ success: true });
    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: "Pending Verification",
        verified_by_user: false,
        verification_exception: false,
      })
    );
    expect(updates).not.toContainEqual(
      expect.objectContaining({ status: "Resolved" })
    );
    expect(mocks.createKnowledgeDraftForTicket).not.toHaveBeenCalled();
  });

  test("clears verification exception when an admin reopens a resolved ticket", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    const { updates } = setup({
      ticket: {
        status: "Resolved",
        assigned_agent_id: agentId,
        verification_exception: true,
      },
    });
    await expect(reopenTicket(ticketId)).resolves.toEqual({ success: true });
    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: "Reopened",
        verified_by_user: false,
        verification_exception: false,
      })
    );
  });

  test("denies a verification exception when organization policy is disabled", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    mocks.getOrganizationPolicy.mockResolvedValue({
      allowVerificationException: false,
    });
    const { updates } = setup();
    await expect(
      submitResolution(ticketId, {
        rootCause: "DNS cache",
        actionsPerformed: "Flushed DNS cache",
        toolsUsed: "Terminal",
        result: "Internet restored",
        verificationMethod: "remote_test",
        verificationReason: "The user was unavailable for confirmation.",
        verificationEvidence: "A remote connectivity test passed twice.",
        userExplanation: "The connection is restored.",
        preventiveRecommendation: "Restart the router monthly.",
      })
    ).resolves.toEqual({
      error: "This organization requires user confirmation before resolution.",
    });
    expect(updates).toHaveLength(0);
  });

  test("requires reason and evidence for an allowed verification exception", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    mocks.getOrganizationPolicy.mockResolvedValue({
      allowVerificationException: true,
    });
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
    ).resolves.toEqual({
      error: "Verification reason and evidence are required for an exception.",
    });
    expect(updates).toHaveLength(0);
  });

  test("resolves with an allowed verification exception and records its evidence", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    mocks.getOrganizationPolicy.mockResolvedValue({
      allowVerificationException: true,
    });
    const { updates, events } = setup();
    await expect(
      submitResolution(ticketId, {
        rootCause: "DNS cache",
        actionsPerformed: "Flushed DNS cache",
        toolsUsed: "Terminal",
        result: "Internet restored",
        verificationMethod: "remote_test",
        verificationReason: "The user was unavailable for confirmation.",
        verificationEvidence: "A remote connectivity test passed twice.",
        userExplanation: "The connection is restored.",
        preventiveRecommendation: "Restart the router monthly.",
      })
    ).resolves.toEqual({ success: true });
    expect(updates[0]).toEqual(
      expect.objectContaining({
        status: "Resolved",
        verified_by_user: false,
        verification_exception: true,
        resolution_report: expect.objectContaining({
          verificationException: expect.objectContaining({
            method: "remote_test",
            reason: "The user was unavailable for confirmation.",
            evidence: "A remote connectivity test passed twice.",
            actorId: session.userId,
          }),
        }),
      })
    );
    expect(events).toEqual([
      expect.objectContaining({ event_type: "verification.exception" }),
    ]);
    expect(mocks.createKnowledgeDraftForTicket).toHaveBeenCalledWith(
      expect.anything(),
      ticketId,
      session.organizationId
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

  test("adds a public comment and notifies the ticket owner", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    setup();
    await expect(addPublicComment(ticketId, "A public reply")).resolves.toEqual(
      {
        success: true,
      }
    );
    expect(mocks.notifyRequester).toHaveBeenCalledWith(
      "reply.public",
      expect.objectContaining({ id: ticketId, user_id: "user-1" }),
      expect.objectContaining({ publicReplyExcerpt: "A public reply" })
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

  test("scrubs credential-like action parameters", async () => {
    mocks.getAdminSession.mockResolvedValue(session);
    const { inserts } = setup();
    await expect(
      recordAction({
        ticketId,
        toolName: "Terminal",
        actionSummary: "Checked connectivity",
        resultSummary: "Completed",
        consentRequired: false,
        consentReceived: false,
        parameters: {
          password: "secret",
          authorization: "Bearer abc123",
          hostname: "example.test",
        },
      })
    ).resolves.toEqual({ success: true });
    expect(inserts).toContainEqual(
      expect.objectContaining({
        parameters: {
          password: "[redacted]",
          authorization: "[redacted]",
          hostname: "example.test",
        },
      })
    );
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
