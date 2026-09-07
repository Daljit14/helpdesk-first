import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import { loginAction } from "./auth";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("loginAction", () => {
  test("redirects when requester membership provisioning fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const rpc = vi.fn().mockRejectedValue(new Error("missing migration"));
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-1",
              email: "user@example.com",
            },
          },
          error: null,
        }),
      },
      rpc,
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "Password1");
    formData.set("next", "/tickets");

    await expect(loginAction(null, formData)).rejects.toThrow(
      "REDIRECT:/tickets"
    );
    expect(rpc).toHaveBeenCalledWith("claim_domain_membership");
    expect(consoleError).toHaveBeenCalledWith(
      "requester membership provisioning failed",
      expect.any(Error)
    );
  });
});
