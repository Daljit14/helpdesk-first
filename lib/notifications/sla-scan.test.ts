import { afterEach, describe, expect, test, vi } from "vitest";
import { scanSla } from "./sla-scan";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueNotification } from "./enqueue";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("./enqueue", () => ({ enqueueNotification: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe("scanSla", () => {
  test("enqueues at-risk and overdue notifications and updates flag columns", async () => {
    const tickets = [
      {
        id: "t1",
        organization_id: "org-1",
        user_id: "u1",
        issue_title: "No internet",
        status: "Needs Human",
        priority: "Normal",
        assigned_agent_id: null,
        human_response_due_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        resolution_due_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        sla_risk_notified_at: null,
        overdue_notified_at: null,
        resolution_overdue_notified_at: null,
        first_human_response_at: null,
      },
    ];

    const staffBuild = {
      select: vi.fn(() => staffBuild),
      eq: vi.fn(() => staffBuild),
      in: vi.fn(() =>
        Promise.resolve({ data: [{ user_id: "admin-1" }], error: null })
      ),
    };

    const ticketBuild = {
      select: vi.fn(() => ticketBuild),
      not: vi.fn(() => Promise.resolve({ data: tickets, error: null })),
      update: vi.fn(() => ticketBuild),
      eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn((table: string) =>
        table === "organization_members" ? staffBuild : ticketBuild
      ),
    } as never);

    const result = await scanSla();
    expect(
      result.atRisk + result.firstResponseOverdue + result.resolutionOverdue
    ).toBeGreaterThanOrEqual(2);
    expect(ticketBuild.update).toHaveBeenCalled();
    expect(vi.mocked(enqueueNotification)).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://localhost:3000/admin/tickets/t1",
      })
    );
  });
});
