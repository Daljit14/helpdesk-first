import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getApprovedSlugs: vi.fn(),
  processAiIntake: vi.fn(),
  notifyEmployeesOfHandoff: vi.fn(),
  notifyRequester: vi.fn(),
  isEscalationPackageEnabled: vi.fn(),
  snapshotEscalationPackage: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/knowledge/governance", () => ({
  getApprovedSlugs: mocks.getApprovedSlugs,
}));
vi.mock("@/lib/ai/intake", () => ({
  processAiIntake: mocks.processAiIntake,
}));
vi.mock("@/lib/tickets/notify", () => ({
  notifyEmployeesOfHandoff: mocks.notifyEmployeesOfHandoff,
  notifyRequester: mocks.notifyRequester,
}));
vi.mock("@/lib/investigation/config", () => ({
  isInvestigationEnabled: () => false,
  isEscalationPackageEnabled: mocks.isEscalationPackageEnabled,
}));
vi.mock("@/lib/investigation/escalation", () => ({
  snapshotEscalationPackage: mocks.snapshotEscalationPackage,
  summarizeEscalationPackage: () => "Diagnosis summary",
}));

import { triageWorkflowTicket } from "./triage";

describe("triageWorkflowTicket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getApprovedSlugs.mockResolvedValue(["wifi-disconnecting"]);
    mocks.processAiIntake.mockRejectedValue(new Error("provider unavailable"));
    mocks.notifyEmployeesOfHandoff.mockResolvedValue(undefined);
    mocks.notifyRequester.mockResolvedValue(undefined);
    mocks.isEscalationPackageEnabled.mockReturnValue(false);
    mocks.snapshotEscalationPackage.mockResolvedValue(null);
  });

  it("escalates when automatic triage fails", async () => {
    const updates: unknown[] = [];
    const events: unknown[] = [];
    const chain = {
      update: vi.fn((value: unknown) => {
        updates.push(value);
        return chain;
      }),
      eq: vi.fn(() => chain),
    };
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "tickets") return chain;
        if (table === "ticket_system_events") {
          return {
            insert: vi.fn(async (value: unknown) => {
              events.push(value);
              return { error: null };
            }),
          };
        }
        return { insert: vi.fn(async () => ({ error: null })) };
      }),
    });

    await triageWorkflowTicket({
      ticketId: "ticket-1",
      organizationId: "org-1",
      userId: "user-1",
      issue: null,
      message: "Wi-Fi is unavailable",
      platform: "Windows",
      diagnosticAnswers: [],
      due: "2026-01-01T00:00:00.000Z",
    });

    expect(updates).toEqual([
      expect.objectContaining({
        status: "Needs Human",
        handoff_reason: "Automatic triage failed.",
        escalated: true,
        resolver_type: "unassigned",
        needs_human_at: expect.any(String),
      }),
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        event_type: "ai.escalated",
        actor_type: "ai",
        detail: { reason: "Automatic triage failed." },
      }),
    ]);
    expect(mocks.notifyEmployeesOfHandoff).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ id: "ticket-1" })
    );
  });

  it("snapshots an escalation package only when the flag is enabled", async () => {
    mocks.isEscalationPackageEnabled.mockReturnValue(true);
    mocks.snapshotEscalationPackage.mockResolvedValue({
      version: 1,
    });
    const chain = {
      update: vi.fn(() => chain),
      eq: vi.fn(() => chain),
    };
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "tickets") return chain;
        if (table === "ticket_system_events") {
          return {
            insert: vi.fn(async () => ({ error: null })),
          };
        }
        return { insert: vi.fn(async () => ({ error: null })) };
      }),
    });

    await triageWorkflowTicket({
      ticketId: "ticket-1",
      organizationId: "org-1",
      userId: "user-1",
      issue: null,
      message: "Needs support",
      platform: "Windows",
      diagnosticAnswers: [],
      due: "2026-01-01T00:00:00.000Z",
    });

    expect(mocks.snapshotEscalationPackage).toHaveBeenCalledWith(
      expect.anything(),
      "ticket-1",
      "org-1"
    );
    mocks.isEscalationPackageEnabled.mockReturnValue(false);
    mocks.snapshotEscalationPackage.mockClear();

    await triageWorkflowTicket({
      ticketId: "ticket-2",
      organizationId: "org-1",
      userId: "user-1",
      issue: null,
      message: "Needs support",
      platform: "Windows",
      diagnosticAnswers: [],
      due: "2026-01-01T00:00:00.000Z",
    });

    expect(mocks.snapshotEscalationPackage).not.toHaveBeenCalled();
  });
});
