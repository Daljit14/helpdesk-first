import { afterEach, describe, expect, test, vi } from "vitest";
import {
  confirmTicketResolved,
  escalateTicket,
  startAiTicket,
} from "./resolution";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createClient: vi.fn(),
  isResolutionTrackingEnabled: vi.fn(),
  isTicketWorkflowEnabled: vi.fn(),
  recordAnalyticsEvent: vi.fn(),
  completeUserHandoff: vi.fn(),
}));

vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/admin/flags", () => ({
  isResolutionTrackingEnabled: mocks.isResolutionTrackingEnabled,
  isTicketWorkflowEnabled: mocks.isTicketWorkflowEnabled,
}));
vi.mock("@/lib/analytics/events", () => ({
  recordAnalyticsEvent: mocks.recordAnalyticsEvent,
}));
vi.mock("@/lib/tickets/handoff", () => ({
  completeUserHandoff: mocks.completeUserHandoff,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
  mocks.isTicketWorkflowEnabled.mockReturnValue(false);
});

const user = { id: "user-1" };
const ticketId = "00000000-0000-4000-8000-000000000001";

describe("resolution actions", () => {
  test("rejects when the flag is off", async () => {
    mocks.isResolutionTrackingEnabled.mockReturnValue(false);
    await expect(
      startAiTicket({ issueId: "no-internet", platform: "Windows" })
    ).resolves.toEqual({ error: "Not available." });
  });

  test("rejects without a signed-in user", async () => {
    mocks.isResolutionTrackingEnabled.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(
      startAiTicket({ issueId: "no-internet", platform: "Windows" })
    ).resolves.toEqual({ error: "Not authorized." });
  });

  test("creates an AI-attempted in-progress ticket", async () => {
    mocks.isResolutionTrackingEnabled.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue(user);
    const single = vi
      .fn()
      .mockResolvedValue({ data: { id: ticketId }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    mocks.createClient.mockResolvedValue({
      from: vi.fn(() => ({ insert })),
    });

    await expect(
      startAiTicket({ issueId: "no-internet", platform: "Windows" })
    ).resolves.toEqual({ ticketId });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        ai_attempted: true,
        status: "In Progress",
      })
    );
    expect(mocks.recordAnalyticsEvent).toHaveBeenCalled();
  });

  test("calls the resolution RPCs", async () => {
    mocks.isResolutionTrackingEnabled.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue(user);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(confirmTicketResolved(ticketId)).resolves.toEqual({
      success: true,
    });
    await expect(escalateTicket(ticketId, "Still broken")).resolves.toEqual({
      success: true,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "confirm_ticket_resolved", {
      ticket: ticketId,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "escalate_ticket", {
      ticket: ticketId,
      reason: "Still broken",
    });
  });

  test("routes guide escalation through the workflow handoff", async () => {
    mocks.isResolutionTrackingEnabled.mockReturnValue(true);
    mocks.isTicketWorkflowEnabled.mockReturnValue(true);
    mocks.getCurrentUser.mockResolvedValue(user);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(escalateTicket(ticketId, "  Still broken  ")).resolves.toEqual(
      {
        success: true,
      }
    );

    expect(rpc).toHaveBeenNthCalledWith(1, "escalate_ticket", {
      ticket: ticketId,
      reason: "Still broken",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "handoff_ticket", {
      ticket: ticketId,
      reason: "Still broken",
      handoff: "user_requested_human",
    });
    expect(mocks.completeUserHandoff).toHaveBeenCalledWith(ticketId);
  });

  test("does not call the workflow handoff when its flag is off", async () => {
    mocks.isResolutionTrackingEnabled.mockReturnValue(true);
    mocks.isTicketWorkflowEnabled.mockReturnValue(false);
    mocks.getCurrentUser.mockResolvedValue(user);
    const rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(escalateTicket(ticketId, "Still broken")).resolves.toEqual({
      success: true,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("escalate_ticket", {
      ticket: ticketId,
      reason: "Still broken",
    });
    expect(mocks.completeUserHandoff).not.toHaveBeenCalled();
  });

  test("rejects invalid UUIDs", async () => {
    mocks.isResolutionTrackingEnabled.mockReturnValue(true);
    await expect(confirmTicketResolved("not-a-uuid")).resolves.toEqual({
      error: "Invalid ticket.",
    });
  });
});
