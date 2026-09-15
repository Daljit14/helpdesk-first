import { describe, expect, test, vi } from "vitest";
import { checkTenant } from "./tenant";

function adminFor(row: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: row, error })),
  };
  return { from: vi.fn(() => query) };
}

describe("checkTenant", () => {
  test("rejects a ticket mismatch", async () => {
    const result = await checkTenant(
      adminFor({ id: "notification-1" }) as never,
      "org-1",
      "ticket-1",
      { ticketId: "ticket-2" }
    );
    expect(result).toEqual({ ok: false, reason: "ticket_mismatch" });
  });

  test("rejects a cross-organization notification", async () => {
    const result = await checkTenant(
      adminFor(null) as never,
      "org-1",
      "ticket-1",
      { ticketId: "ticket-1", notificationId: "notification-1" }
    );
    expect(result.ok).toBe(false);
  });

  test("fails closed for unknown id parameters", async () => {
    const result = await checkTenant(
      adminFor({ id: "x" }) as never,
      "org-1",
      "ticket-1",
      { ticketId: "ticket-1", mysteryId: "x" }
    );
    expect(result).toEqual({ ok: false, reason: "unknown_id:mysteryId" });
  });
});
