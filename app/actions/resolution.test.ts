import { afterEach, describe, expect, test, vi } from "vitest";
import {
  confirmTicketResolved,
  escalateTicket,
  respondToAiConsent,
  startAiTicket,
} from "./resolution";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  isResolutionTrackingEnabled: vi.fn(),
  isTicketWorkflowEnabled: vi.fn(),
  recordAnalyticsEvent: vi.fn(),
  completeUserHandoff: vi.fn(),
  createWorkflowTicket: vi.fn(),
  resumeAfterApproval: vi.fn(),
}));

vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
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
vi.mock("@/app/actions/tickets", () => ({
  createWorkflowTicket: mocks.createWorkflowTicket,
}));
vi.mock("@/lib/autonomy/executor/resume", () => ({
  resumeAfterApproval: mocks.resumeAfterApproval,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const originalWorkflowEnv = process.env.HELP_DESK_TICKET_WORKFLOW_ENABLED;

afterEach(() => {
  vi.clearAllMocks();
  mocks.isTicketWorkflowEnabled.mockReturnValue(false);
  if (originalWorkflowEnv === undefined) {
    delete process.env.HELP_DESK_TICKET_WORKFLOW_ENABLED;
  } else {
    process.env.HELP_DESK_TICKET_WORKFLOW_ENABLED = originalWorkflowEnv;
  }
});

const user = { id: "user-1" };
const ticketId = "00000000-0000-4000-8000-000000000001";

function consentAdmin(
  options: {
    request?: Record<string, unknown> | null;
    ticket?: Record<string, unknown> | null;
    run?: Record<string, unknown> | null;
  } = {}
) {
  const from = vi.fn((table: string) => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    let updated = false;
    for (const method of ["select", "eq", "update"]) {
      chain[method] = () => {
        if (method === "update") updated = true;
        return chain;
      };
    }
    chain.maybeSingle = async () => {
      if (table === "approval_requests")
        return {
          data: updated ? { id: "request-1" } : (options.request ?? null),
          error: null,
        };
      if (table === "tickets")
        return { data: options.ticket ?? null, error: null };
      return { data: options.run ?? null, error: null };
    };
    return chain;
  });
  return { from };
}

describe("resolution actions", () => {
  test("rejects unauthenticated consent responses", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(respondToAiConsent("request-1", "grant")).resolves.toEqual({
      error: "Not authorized.",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  test("rejects consent responses from the wrong ticket owner", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.createAdminClient.mockReturnValue(
      consentAdmin({
        request: {
          id: "request-1",
          organization_id: "org-1",
          run_id: "run-1",
          ticket_id: ticketId,
          type: "user_consent",
          status: "requested",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        ticket: { user_id: "other-user", organization_id: "org-1" },
      })
    );
    await expect(respondToAiConsent("request-1", "grant")).resolves.toEqual({
      error: "Consent request not found.",
    });
  });

  test("rejects expired consent requests", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.createAdminClient.mockReturnValue(
      consentAdmin({
        request: {
          id: "request-1",
          organization_id: "org-1",
          run_id: "run-1",
          ticket_id: ticketId,
          type: "user_consent",
          status: "requested",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
        ticket: { user_id: user.id, organization_id: "org-1" },
      })
    );
    await expect(respondToAiConsent("request-1", "grant")).resolves.toEqual({
      error: "This consent request has expired.",
    });
  });

  test("denies consent and resumes the run so it escalates", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const admin = consentAdmin({
      request: {
        id: "request-1",
        organization_id: "org-1",
        run_id: "run-1",
        ticket_id: ticketId,
        type: "user_consent",
        status: "requested",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      ticket: { user_id: user.id, organization_id: "org-1" },
      run: { id: "run-1", status: "awaiting_consent" },
    });
    mocks.createAdminClient.mockReturnValue(admin);
    await expect(respondToAiConsent("request-1", "deny")).resolves.toEqual({
      success: true,
    });
    expect(mocks.resumeAfterApproval).toHaveBeenCalledWith(
      admin,
      { id: "run-1", status: "awaiting_consent" },
      { actor: user.id }
    );
  });

  test("grants consent and resumes the bound run", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const admin = consentAdmin({
      request: {
        id: "request-1",
        organization_id: "org-1",
        run_id: "run-1",
        ticket_id: ticketId,
        type: "user_consent",
        status: "requested",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      ticket: { user_id: user.id, organization_id: "org-1" },
      run: { id: "run-1", status: "awaiting_consent" },
    });
    mocks.createAdminClient.mockReturnValue(admin);
    await expect(respondToAiConsent("request-1", "grant")).resolves.toEqual({
      success: true,
    });
    expect(mocks.resumeAfterApproval).toHaveBeenCalledTimes(1);
  });

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

  test("passes assistant intake context to workflow tickets", async () => {
    process.env.HELP_DESK_TICKET_WORKFLOW_ENABLED = "true";
    mocks.createWorkflowTicket.mockResolvedValue({ success: true, ticketId });

    await expect(
      startAiTicket({
        issueId: "no-internet",
        platform: "Windows",
        message: "  Wi-Fi stopped working  ",
        diagnosticAnswers: [
          { questionId: "which-platform", answer: "Windows" },
          { questionId: "where", answer: "Office" },
        ],
      })
    ).resolves.toEqual({ ticketId });

    expect(mocks.createWorkflowTicket).toHaveBeenCalledWith({
      issueId: "no-internet",
      platform: "Windows",
      message: "Wi-Fi stopped working",
      diagnosticAnswers: [
        { questionId: "which-platform", answer: "Windows" },
        { questionId: "where", answer: "Office" },
      ],
    });
  });

  test("uses the generic workflow message when assistant context is omitted", async () => {
    process.env.HELP_DESK_TICKET_WORKFLOW_ENABLED = "true";
    mocks.createWorkflowTicket.mockResolvedValue({ success: true, ticketId });

    await expect(
      startAiTicket({ issueId: "no-internet", platform: "Windows" })
    ).resolves.toEqual({ ticketId });

    expect(mocks.createWorkflowTicket).toHaveBeenCalledWith({
      issueId: "no-internet",
      platform: "Windows",
      message: 'I need help with the "No internet connection" problem.',
      diagnosticAnswers: [],
    });
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
