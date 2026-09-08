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

import { loginAction, signUpAction, verifySignupCodeAction } from "./auth";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("loginAction", () => {
  test("requires Turnstile when configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "Password1");

    await expect(loginAction(null, formData)).resolves.toEqual({
      error: "Please complete the security check.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  test("passes Turnstile token to sign up", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });
    mocks.createClient.mockResolvedValue({ auth: { signUp } });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "Password1");
    formData.set("confirmPassword", "Password1");
    formData.set("captchaToken", "captcha-token");

    await expect(signUpAction(null, formData)).rejects.toThrow(
      "REDIRECT:/check-email?email=user%40example.com&next=%2F"
    );
    expect(signUp).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Password1",
      options: { captchaToken: "captcha-token" },
    });
  });

  test("redirects unconfirmed users to code verification", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("Email not confirmed"),
        }),
      },
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("password", "Password1");
    formData.set("next", "/tickets");

    await expect(loginAction(null, formData)).rejects.toThrow(
      "REDIRECT:/check-email?email=user%40example.com&next=%2Ftickets"
    );
  });

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

describe("verifySignupCodeAction", () => {
  test("verifies a signup code and redirects", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: { id: "user-1", email: "user@example.com" } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { verifyOtp },
      rpc: vi.fn(),
    });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            })),
          })),
        })),
        insert: vi.fn().mockResolvedValue({ error: null }),
      })),
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("code", "123456");
    formData.set("next", "/tickets");

    await expect(verifySignupCodeAction(null, formData)).rejects.toThrow(
      "REDIRECT:/tickets"
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      token: "123456",
      type: "signup",
    });
  });

  test("rejects an invalid signup code", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    const formData = new FormData();
    formData.set("email", "user@example.com");
    formData.set("code", "12345");

    await expect(verifySignupCodeAction(null, formData)).resolves.toEqual({
      error: "That code is invalid or expired.",
    });
  });
});
