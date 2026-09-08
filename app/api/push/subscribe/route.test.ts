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

function request() {
  return new Request("http://localhost/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: "https://push.example/endpoint",
      keys: { p256dh: "public", auth: "secret" },
    }),
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.clearAllMocks());

describe("push subscription route", () => {
  test("takes ownership of an existing endpoint", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-2" });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const builder = {
      delete: vi.fn(() => builder),
      eq: vi.fn(() => Promise.resolve({ error: null })),
      insert,
    };
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => builder),
    });

    await expect(
      POST(request()).then((response) => response.json())
    ).resolves.toEqual({ ok: true });
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith(
      "endpoint",
      "https://push.example/endpoint"
    );
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-2",
      endpoint: "https://push.example/endpoint",
      p256dh: "public",
      auth: "secret",
    });
  });
});
