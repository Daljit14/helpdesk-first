import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  update: vi.fn(),
  ticketUpdate: vi.fn(),
  eventInsert: vi.fn(),
}));

vi.mock("@/lib/ai/rate-limit", () => ({
  createRateLimiter: () => ({ check: vi.fn(async () => ({ allowed: true })) }),
  getRateLimitConfig: () => ({}),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "verification_links") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.row, error: null }),
            }),
          }),
          update: (value: unknown) => {
            state.update(value);
            return {
              eq: () => ({
                eq: () => ({
                  is: async () => ({ error: null }),
                }),
              }),
            };
          },
        };
      }
      if (table === "tickets") {
        return {
          update: (value: unknown) => {
            state.ticketUpdate(value);
            return {
              eq: () => ({
                eq: () => ({ eq: async () => ({ error: null }) }),
              }),
            };
          },
        };
      }
      return { insert: state.eventInsert };
    },
  }),
}));

import { GET } from "./route";

const request = new Request("https://helpdesk.test/verify/token");

describe("verification link route", () => {
  beforeEach(() => {
    state.row = {
      id: "link-1",
      organization_id: "org-1",
      ticket_id: "ticket-1",
      user_id: "user-1",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      used_at: null,
    };
    state.update.mockClear();
    state.ticketUpdate.mockClear();
    state.eventInsert.mockClear();
  });

  test("marks a valid link used and confirms the ticket", async () => {
    const response = await GET(request, {
      params: Promise.resolve({ token: "token" }),
    });
    expect(response.status).toBe(307);
    expect(state.update).toHaveBeenCalledWith(
      expect.objectContaining({ used_at: expect.any(String) })
    );
    expect(state.ticketUpdate).toHaveBeenCalledWith({ user_confirmed: true });
  });

  test("returns gone for a reused token", async () => {
    state.row!.used_at = new Date().toISOString();
    expect(
      (await GET(request, { params: Promise.resolve({ token: "token" }) }))
        .status
    ).toBe(410);
  });

  test("returns gone for an expired token", async () => {
    state.row!.expires_at = new Date(Date.now() - 60_000).toISOString();
    expect(
      (await GET(request, { params: Promise.resolve({ token: "token" }) }))
        .status
    ).toBe(410);
  });
});
