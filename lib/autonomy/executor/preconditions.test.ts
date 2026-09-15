import { describe, expect, test, vi } from "vitest";
import { checkPreconditions } from "./preconditions";

function adminFor(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  return { from: vi.fn(() => query) };
}

describe("executor preconditions", () => {
  test("checks a ticket in the run organization", async () => {
    const result = await checkPreconditions(
      {
        admin: adminFor({ id: "ticket-1" }) as never,
        organizationId: "org-1",
        ticketId: "ticket-1",
        params: {},
      },
      ["ticket_exists"]
    );
    expect(result).toEqual({ ok: true });
  });

  test("fails unknown preconditions closed", async () => {
    const result = await checkPreconditions(
      {
        admin: adminFor({}) as never,
        organizationId: "org-1",
        ticketId: "ticket-1",
        params: {},
      },
      ["made_up"]
    );
    expect(result).toEqual({
      ok: false,
      reason: "unknown_precondition:made_up",
    });
  });
});
