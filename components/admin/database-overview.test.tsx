import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DatabaseOverview } from "./database-overview";
import type { DbOverview } from "@/lib/admin/database-overview";

function overview(): DbOverview {
  return {
    generatedAt: "2025-01-01T00:00:00.000Z",
    sections: [
      {
        key: "users",
        label: "Users & logins",
        count: 1,
        columns: ["email", "provider", "created_at", "last_sign_in_at"],
        rows: [
          {
            email: "user@example.com",
            provider: "email",
            created_at: "2025-01-01T00:00:00.000Z",
            last_sign_in_at: null,
          },
        ],
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("DatabaseOverview", () => {
  test("does not fetch while Live is off", () => {
    const fetch = vi.spyOn(global, "fetch");
    render(<DatabaseOverview initial={overview()} />);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("polls with since, renders returned events, and persists Live", async () => {
    vi.useFakeTimers();
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          events: [
            {
              id: "ticket_created:ticket-1:2025-01-01T00:00:01.000Z",
              kind: "ticket_created",
              at: "2025-01-01T00:00:01.000Z",
              title: "Ticket created: Wi-Fi keeps dropping",
            },
          ],
          cursor: "2025-01-01T00:00:01.000Z",
        }),
        { status: 200 }
      )
    );
    render(<DatabaseOverview initial={overview()} />);
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(localStorage.getItem("hf-admin-live")).toBe("on");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("since="),
      expect.objectContaining({ cache: "no-store" })
    );
    expect(
      screen.getByText("Ticket created: Wi-Fi keeps dropping")
    ).toBeInTheDocument();
  });
});
