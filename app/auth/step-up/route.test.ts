import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createClient: vi.fn(),
  signInWithOAuth: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

function request(url = "http://localhost/auth/step-up?next=%2Fassistant") {
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSupabaseConfigured.mockReturnValue(true);
  mocks.createClient.mockResolvedValue({
    auth: { signInWithOAuth: mocks.signInWithOAuth },
  });
  mocks.signInWithOAuth.mockResolvedValue({
    data: { url: "https://identity.example/authorize" },
    error: null,
  });
});

describe("step-up route", () => {
  test("requests fresh Azure authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      app_metadata: { provider: "azure", providers: ["azure"] },
    });

    const response = await GET(request());
    expect(response.headers.get("location")).toBe(
      "https://identity.example/authorize"
    );
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "azure",
      options: expect.objectContaining({
        scopes: "email openid profile",
        queryParams: { prompt: "login", max_age: "0" },
      }),
    });
    expect(mocks.signInWithOAuth.mock.calls[0][0].options.redirectTo).toContain(
      "/auth/callback?next=%2Fauth%2Fstep-up%2Fdone"
    );
  });

  test("does not request undocumented Google forced reauthentication", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      app_metadata: { provider: "google", providers: ["google"] },
    });

    await GET(request());
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: expect.objectContaining({
        scopes: "email openid profile",
      }),
    });
    expect(
      mocks.signInWithOAuth.mock.calls[0][0].options.queryParams
    ).toBeUndefined();
  });

  test("sends password users to the explicit reauthentication form", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      app_metadata: { provider: "email", providers: ["email"] },
    });

    const response = await GET(request());
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?reauth=1&next=%2Fauth%2Fstep-up%2Fdone"
    );
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  test("does not assume forced reauthentication for linked providers", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "user-1",
      app_metadata: { provider: "google", providers: ["google", "azure"] },
    });

    const response = await GET(request());
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?reauth=1&next=%2Fauth%2Fstep-up%2Fdone"
    );
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });

  test("requires a signed-in user and sanitizes the login return path", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await GET(
      request("http://localhost/auth/step-up?next=%2F%2Fevil.example")
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fassistant"
    );
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });
});
