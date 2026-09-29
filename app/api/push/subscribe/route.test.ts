import { afterEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

const endpoint = "https://push.example/endpoint";
const validKeys = {
  p256dh: "a".repeat(60),
  auth: "b".repeat(16),
};

function request(body: unknown) {
  return new Request("http://localhost/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function adminBuilder(existing: Record<string, unknown> | null = null) {
  const update = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: null })),
  }));
  const insert = vi.fn().mockResolvedValue({ error: null });
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
    update,
    insert,
  };
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn(() => builder),
  });
  return { builder, update, insert };
}

afterEach(() => vi.clearAllMocks());

describe("push subscription route", () => {
  test("does not claim another account's endpoint", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-2" });
    const { builder, update, insert } = adminBuilder({
      id: "subscription-1",
      user_id: "user-1",
    });

    const response = await POST(request({ endpoint, keys: validKeys }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Subscription belongs to another account.",
      code: "conflict",
    });
    expect(builder.maybeSingle).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  test("updates an endpoint owned by the caller", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    const { update, insert } = adminBuilder({
      id: "subscription-1",
      user_id: "user-1",
    });

    await expect(
      POST(request({ endpoint, keys: validKeys })).then((response) =>
        response.json()
      )
    ).resolves.toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(validKeys);
    expect(insert).not.toHaveBeenCalled();
  });

  test("inserts a new endpoint", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-2" });
    const { insert, update } = adminBuilder();

    await expect(
      POST(request({ endpoint, keys: validKeys })).then((response) =>
        response.json()
      )
    ).resolves.toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-2",
      endpoint,
      ...validKeys,
    });
    expect(update).not.toHaveBeenCalled();
  });

  test.each([
    { endpoint: "http://push.example/endpoint", keys: validKeys },
    { endpoint, keys: { ...validKeys, p256dh: "bad key" } },
    { endpoint, keys: { ...validKeys, auth: "short" } },
  ])("rejects invalid subscription payload %#", async (body) => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "invalid" });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
