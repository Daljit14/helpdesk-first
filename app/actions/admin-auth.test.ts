import { afterEach, describe, expect, test, vi } from "vitest";
import { adminLogin } from "./admin-auth";
import { createClient } from "@/lib/supabase/server";
import { membershipFor, setAdminSessionCookie } from "@/lib/admin/auth";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ "x-forwarded-for": "198.51.100.4" })
  ),
}));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/admin/flags", () => ({
  isAdminDashboardEnabled: vi.fn(() => true),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({
  membershipFor: vi.fn(),
  recordAudit: vi.fn(),
  setAdminSessionCookie: vi.fn(async () => true),
  clearAdminSessionCookie: vi.fn(),
}));

const mockedClient = vi.mocked(createClient);
const mockedMembership = vi.mocked(membershipFor);
const mockedCookie = vi.mocked(setAdminSessionCookie);

function form(email: string, password = "correct horse battery staple") {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  data.set("next", "/admin/operations");
  return data;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("adminLogin", () => {
  test("signs out non-members with a generic error", async () => {
    const signOut = vi.fn();
    mockedClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { user: { id: "user-1", email: "user@example.com" } },
          error: null,
        })),
        signOut,
      },
    } as never);
    mockedMembership.mockResolvedValue(null);
    await expect(adminLogin(null, form("user@example.com"))).resolves.toEqual({
      error: "Invalid credentials or not authorized.",
    });
    expect(signOut).toHaveBeenCalled();
    expect(mockedCookie).not.toHaveBeenCalled();
  });

  test("rate limits after five attempts", async () => {
    mockedClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { user: null },
          error: new Error("invalid"),
        })),
      },
    } as never);
    const email = `limited-${Date.now()}@example.com`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await adminLogin(null, form(email));
    }
    await expect(adminLogin(null, form(email))).resolves.toEqual({
      error: "Too many login attempts. Please try again later.",
    });
  });

  test("does not log passwords", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockedClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { user: null },
          error: new Error("invalid"),
        })),
      },
    } as never);
    const password = `secret-${Date.now()}`;
    await adminLogin(null, form(`nolog-${Date.now()}@example.com`, password));
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain(password);
    errorSpy.mockRestore();
  });
});
