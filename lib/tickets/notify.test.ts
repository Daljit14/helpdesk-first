import { afterEach, describe, expect, test, vi } from "vitest";
import { notifyEmployeesOfHandoff, notifyOverdueTickets } from "./notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/push/send", () => ({ sendPushToUser: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe("workflow notifications", () => {
  test("notifies every organization admin and support agent on handoff", async () => {
    const members = [
      { user_id: "admin-1", role: "admin" },
      { user_id: "agent-1", role: "support_agent" },
    ];
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => Promise.resolve({ data: members, error: null })),
    };
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => builder),
    } as never);

    await notifyEmployeesOfHandoff("org-1", {
      id: "ticket-1",
      issue_title: "No internet",
      priority: "High",
      human_response_due_at: "2025-01-01T10:00:00Z",
    });

    expect(vi.mocked(sendPushToUser)).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(sendPushToUser).mock.calls.map(([userId]) => userId)
    ).toEqual(["admin-1", "agent-1"]);
  });

  test("notifies admins once for each overdue ticket", async () => {
    let ticketQueryCount = 0;
    const ticketBuilder = {
      select: vi.fn(() => ticketBuilder),
      eq: vi.fn(() => ticketBuilder),
      is: vi.fn(() => ticketBuilder),
      not: vi.fn(() => ticketBuilder),
      lt: vi.fn(() => {
        ticketQueryCount += 1;
        return Promise.resolve({
          data:
            ticketQueryCount === 1
              ? [
                  {
                    id: "ticket-1",
                    user_id: "user-1",
                    issue_title: "Overdue",
                    overdue_notified_at: null,
                  },
                ]
              : [],
          error: null,
        });
      }),
      update: vi.fn(() => ticketBuilder),
    };
    const memberBuilder = {
      select: vi.fn(() => memberBuilder),
      eq: vi.fn((column: string) =>
        column === "role"
          ? Promise.resolve({ data: [{ user_id: "admin-1" }], error: null })
          : memberBuilder
      ),
    };
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn((table: string) =>
        table === "tickets" ? ticketBuilder : memberBuilder
      ),
    } as never);

    await notifyOverdueTickets("org-1");
    await notifyOverdueTickets("org-1");

    expect(vi.mocked(sendPushToUser)).toHaveBeenCalledTimes(1);
    expect(ticketBuilder.update).toHaveBeenCalledTimes(1);
  });
});
