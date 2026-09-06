import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  processAiIntake: vi.fn(),
  notifyEmployeesOfHandoff: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isTicketWorkflowEnabled: vi.fn(() => true),
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
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createWorkflowTicket, requestHuman, verifyTicket } from "./tickets";

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
      if (table === "ticket_system_events") return insertTable(events);
      if (table === "ticket_comments") return insertTable(comments);
      return insertTable([]);
    }),
  });
  return { updates, events, comments };
}

afterEach(() => vi.clearAllMocks());

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
    expect(updates).toEqual([
      expect.objectContaining({ status: "AI Resolving" }),
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: "ai.assigned" }),
        expect.objectContaining({ event_type: "ai.solution_offered" }),
      ])
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
    expect(updates).toEqual([
      expect.objectContaining({ status: "Needs Human" }),
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: "ai.escalated" }),
      ])
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
  });
});
