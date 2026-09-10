import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  processAiIntake: vi.fn(),
  notifyEmployeesOfHandoff: vi.fn(),
  notifyRequester: vi.fn(),
  notifyAssignedStaff: vi.fn(),
  createKnowledgeDraftForTicket: vi.fn(),
  isTicketWorkflowEnabled: vi.fn(() => true),
  isUserPortalEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/admin/flags", () => ({
  isTicketWorkflowEnabled: mocks.isTicketWorkflowEnabled,
  isUserPortalEnabled: mocks.isUserPortalEnabled,
  isSecureAttachmentsEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/ai/intake", () => ({ processAiIntake: mocks.processAiIntake }));
vi.mock("@/lib/ai/mock-provider", () => ({
  createAiProvider: vi.fn(() => ({})),
}));
vi.mock("@/lib/tickets/notify", () => ({
  notifyEmployeesOfHandoff: mocks.notifyEmployeesOfHandoff,
  notifyRequester: mocks.notifyRequester,
  notifyAssignedStaff: mocks.notifyAssignedStaff,
}));
vi.mock("@/lib/knowledge/learning", () => ({
  createKnowledgeDraftForTicket: mocks.createKnowledgeDraftForTicket,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({
  after: vi.fn((callback: () => unknown) => callback()),
}));

import {
  createWorkflowTicket,
  rateTicket,
  reopenTicketByUser,
  rejectAiSolution,
  recordStepOutcome,
  requestHuman,
  verifyTicket,
} from "./tickets";

const ticketId = "00000000-0000-4000-8000-000000000001";
const user = { id: "user-1" };

function setupAdmin() {
  const updates: unknown[] = [];
  const events: unknown[] = [];
  const comments: unknown[] = [];
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({
      data: { organization_id: "org-1" },
      error: null,
    })),
    single: vi.fn(async () => ({ data: { id: ticketId }, error: null })),
  };
  const tickets = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn((value: unknown) => {
      updates.push(value);
      return chain;
    }),
  };
  const insertTable = (target: unknown[]) => ({
    insert: vi.fn((value: unknown) => {
      target.push(value);
      return Promise.resolve({ error: null });
    }),
  });
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "organization_members") return chain;
      if (table === "tickets") return tickets;
      if (table === "organization_policies") return chain;
      if (table === "ticket_system_events") return insertTable(events);
      if (table === "ticket_comments") return insertTable(comments);
      return insertTable([]);
    }),
  });
  return { updates, events, comments };
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.isTicketWorkflowEnabled.mockReturnValue(true);
  mocks.isUserPortalEnabled.mockReturnValue(true);
});

describe("workflow ticket actions", () => {
  test("creates a low-risk AI ticket and offers the matched solution", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.processAiIntake.mockResolvedValue({
      status: "success",
      output: {
        decision: "match",
        confidence: 0.95,
        matchedIssueSlug: "wifi-disconnecting",
      },
    });
    const { updates, events } = setupAdmin();

    await expect(
      createWorkflowTicket({
        message: "My Wi-Fi keeps disconnecting",
        platform: "Windows",
      })
    ).resolves.toEqual({ success: true, ticketId });
    await vi.waitFor(() =>
      expect(updates).toEqual([
        expect.objectContaining({ status: "AI Resolving" }),
      ])
    );
    await vi.waitFor(() =>
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event_type: "ai.assigned" }),
          expect.objectContaining({ event_type: "ai.solution_offered" }),
        ])
      )
    );
    expect(updates).not.toContainEqual(
      expect.objectContaining({ status: "Resolved" })
    );
  });

  test("routes malware messages to humans immediately", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "malware-user" });
    mocks.processAiIntake.mockResolvedValue({
      status: "success",
      output: {
        decision: "match",
        confidence: 0.95,
        matchedIssueSlug: "wifi-disconnecting",
      },
    });
    const { updates, events } = setupAdmin();

    await expect(
      createWorkflowTicket({
        message: "Malware is encrypting my files",
        platform: "Windows",
      })
    ).resolves.toEqual({ success: true, ticketId });
    await vi.waitFor(() =>
      expect(updates).toEqual([
        expect.objectContaining({ status: "Needs Human" }),
      ])
    );
    await vi.waitFor(() =>
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ event_type: "ai.escalated" }),
        ])
      )
    );
    expect(mocks.notifyEmployeesOfHandoff).toHaveBeenCalled();
  });

  test("requests human support through the handoff RPC", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "handoff-user" });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc });
    setupAdmin();

    await expect(requestHuman(ticketId, "I need an employee")).resolves.toEqual(
      {
        success: true,
      }
    );
    expect(rpc).toHaveBeenCalledWith("handoff_ticket", {
      ticket: ticketId,
      reason: "I need an employee",
      handoff: "user_requested_human",
    });
    expect(mocks.notifyEmployeesOfHandoff).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ id: ticketId })
    );
  });

  test("verifies a ticket through the user verification RPC", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "verify-user" });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(verifyTicket(ticketId, true)).resolves.toEqual({
      success: true,
    });
    expect(rpc).toHaveBeenCalledWith("user_verify_ticket", {
      ticket: ticketId,
      confirmed: true,
    });
    expect(mocks.createKnowledgeDraftForTicket).toHaveBeenCalledWith(
      expect.anything(),
      ticketId,
      "org-1"
    );
  });

  test("does not create a learning draft when verification is rejected", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "verify-user" });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(verifyTicket(ticketId, false)).resolves.toEqual({
      success: true,
    });
    expect(mocks.createKnowledgeDraftForTicket).not.toHaveBeenCalled();
  });

  test("portal actions are unavailable when the portal flag is off", async () => {
    mocks.isUserPortalEnabled.mockReturnValue(false);
    await expect(rateTicket(ticketId, 5, "")).resolves.toEqual({
      error: "Not available.",
    });
  });

  test("rejects an invalid rating before calling the RPC", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(rateTicket(ticketId, 6, "")).resolves.toEqual({
      error: "Invalid rating.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rates a ticket and records the portal event", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc });
    const { events } = setupAdmin();
    await expect(rateTicket(ticketId, 4, "Helpful")).resolves.toEqual({
      success: true,
    });
    expect(rpc).toHaveBeenCalledWith("user_rate_ticket", {
      ticket: ticketId,
      rating: 4,
      comment: "Helpful",
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "ticket.rated",
          detail: { rating: 4 },
        }),
      ])
    );
  });

  test("maps a closed reopen window to a user-friendly error", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const rpc = vi.fn().mockResolvedValue({
      error: { message: "reopen window closed" },
    });
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(reopenTicketByUser(ticketId, "Still broken")).resolves.toEqual(
      {
        error:
          "This ticket can no longer be reopened. Please submit a new ticket.",
      }
    );
  });

  test("rejects an AI solution through the existing failure RPC", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const comments: unknown[] = [];
    mocks.createClient.mockResolvedValue({
      rpc,
      from: vi.fn(() => ({
        insert: vi.fn((value: unknown) => {
          comments.push(value);
          return Promise.resolve({ error: null });
        }),
      })),
    });
    setupAdmin();
    await expect(rejectAiSolution(ticketId, "Still broken")).resolves.toEqual({
      success: true,
    });
    expect(rpc).toHaveBeenCalledWith("record_ai_attempt_failed", {
      ticket: ticketId,
    });
    expect(comments).toEqual([
      expect.objectContaining({ message: "Didn't work: Still broken" }),
    ]);
  });

  test("rejects invalid step outcomes before calling the RPC", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(
      recordStepOutcome(ticketId, "wifi-disconnecting", 100, "failed")
    ).resolves.toEqual({ error: "Invalid step outcome." });
    await expect(
      recordStepOutcome(ticketId, "wifi-disconnecting", 1, "unknown" as never)
    ).resolves.toEqual({ error: "Invalid step outcome." });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("records a valid step outcome through the RPC", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(
      recordStepOutcome(ticketId, "wifi-disconnecting", 1, "worked")
    ).resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("record_step_outcome", {
      ticket: ticketId,
      guide: "wifi-disconnecting",
      step: 1,
      result: "worked",
    });
  });
});
