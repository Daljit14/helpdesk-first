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

function deviceAdmin(ticket: unknown, devices: unknown[]) {
  const ticketQuery = {
    select: vi.fn(() => ticketQuery),
    eq: vi.fn(() => ticketQuery),
    maybeSingle: vi.fn(async () => ({ data: ticket, error: null })),
  };
  const deviceQuery = {
    select: vi.fn(() => deviceQuery),
    eq: vi.fn(() => deviceQuery),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: devices, error: null }).then(resolve),
  };
  return {
    from: vi.fn((table: string) =>
      table === "tickets" ? ticketQuery : deviceQuery
    ),
  };
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

  test("normalizes ticket platform before matching an active device", async () => {
    const result = await checkPreconditions(
      {
        admin: deviceAdmin({ user_id: "user-1", platform: "macOS" }, [
          { id: "device-1", platform: "macos" },
        ]) as unknown as Parameters<typeof checkPreconditions>[0]["admin"],
        organizationId: "org-1",
        ticketId: "ticket-1",
        params: {},
      },
      ["requester_has_active_device"]
    );
    expect(result).toEqual({ ok: true });
  });

  test("rejects a device with a different normalized platform", async () => {
    const result = await checkPreconditions(
      {
        admin: deviceAdmin({ user_id: "user-1", platform: "Windows" }, [
          { id: "device-1", platform: "linux" },
        ]) as unknown as Parameters<typeof checkPreconditions>[0]["admin"],
        organizationId: "org-1",
        ticketId: "ticket-1",
        params: {},
      },
      ["requester_has_active_device"]
    );
    expect(result).toEqual({
      ok: false,
      reason: "device_platform_mismatch",
    });
  });
});
