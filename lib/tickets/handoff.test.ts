import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  isEscalationPackageEnabled: vi.fn(),
  snapshotEscalationPackage: vi.fn(),
  summarizeEscalationPackage: vi.fn(),
  notifyEmployeesOfHandoff: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/investigation/config", () => ({
  isEscalationPackageEnabled: mocks.isEscalationPackageEnabled,
}));
vi.mock("@/lib/investigation/escalation", () => ({
  snapshotEscalationPackage: mocks.snapshotEscalationPackage,
  summarizeEscalationPackage: mocks.summarizeEscalationPackage,
}));
vi.mock("./notify", () => ({
  notifyEmployeesOfHandoff: mocks.notifyEmployeesOfHandoff,
}));

import { completeUserHandoff } from "./handoff";

const ticketId = "00000000-0000-4000-8000-000000000001";

function setupTicket(ticket: Record<string, unknown> | null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: ticket, error: null })),
  };
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn(() => builder),
  });
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.isEscalationPackageEnabled.mockReturnValue(false);
});

describe("completeUserHandoff", () => {
  test("snapshots and includes a diagnosis when the flag is enabled", async () => {
    const ticket = {
      id: ticketId,
      organization_id: "org-1",
      issue_title: "No internet",
      priority: "High",
      human_response_due_at: "2026-01-01T00:00:00.000Z",
      user_id: "user-1",
    };
    setupTicket(ticket);
    mocks.isEscalationPackageEnabled.mockReturnValue(true);
    const snapshot = { version: 1 };
    mocks.snapshotEscalationPackage.mockResolvedValue(snapshot);
    mocks.summarizeEscalationPackage.mockReturnValue("Diagnosis summary");

    await completeUserHandoff(ticketId);

    expect(mocks.snapshotEscalationPackage).toHaveBeenCalledWith(
      expect.anything(),
      ticketId,
      "org-1"
    );
    expect(mocks.notifyEmployeesOfHandoff).toHaveBeenCalledWith("org-1", {
      id: ticketId,
      issue_title: "No internet",
      priority: "High",
      human_response_due_at: "2026-01-01T00:00:00.000Z",
      diagnosis: "Diagnosis summary",
    });
  });

  test("notifies without a diagnosis when the flag is disabled", async () => {
    setupTicket({
      id: ticketId,
      organization_id: "org-1",
      issue_title: "No internet",
      priority: "Normal",
      human_response_due_at: null,
      user_id: "user-1",
    });
    mocks.isEscalationPackageEnabled.mockReturnValue(false);

    await completeUserHandoff(ticketId);

    expect(mocks.snapshotEscalationPackage).not.toHaveBeenCalled();
    expect(mocks.notifyEmployeesOfHandoff).toHaveBeenCalledWith("org-1", {
      id: ticketId,
      issue_title: "No internet",
      priority: "Normal",
      human_response_due_at: null,
      diagnosis: undefined,
    });
  });

  test("does nothing when the ticket is not found", async () => {
    setupTicket(null);

    await completeUserHandoff(ticketId);

    expect(mocks.snapshotEscalationPackage).not.toHaveBeenCalled();
    expect(mocks.notifyEmployeesOfHandoff).not.toHaveBeenCalled();
  });
});
