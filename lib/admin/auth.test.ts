import { createHmac } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";
const { notFound, redirect, cookieStore } = vi.hoisted(() => {
  const store = {
    value: undefined as string | undefined,
    get: vi.fn(() => (store.value ? { value: store.value } : undefined)),
  };
  return {
    cookieStore: store,
    notFound: vi.fn(() => {
      throw new Error("NOT_FOUND");
    }),
    redirect: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
  };
});
import { getAdminSession, requireAdminApi, requireAdminPage } from "./auth";
import { getCurrentUser } from "@/lib/supabase/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/admin/flags", () => ({
  isAdminDashboardEnabled: vi.fn(
    () => process.env.HELP_DESK_ADMIN_DASHBOARD_ENABLED === "true"
  ),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("next/navigation", () => ({ notFound, redirect }));

const mockedUser = vi.mocked(getCurrentUser);
const mockedAdmin = vi.mocked(createAdminClient);
const mockedClient = vi.mocked(createClient);

function sessionCookie(userId: string, expiresAt: number, secret: string) {
  const signature = createHmac("sha256", secret)
    .update(`${userId}:${expiresAt}`)
    .digest("hex");
  return `${signature}.${expiresAt}`;
}

function configureMembership(role = "admin", mfaEnrolled = false) {
  const admin = {
    from: vi.fn((table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () =>
          table === "organization_members"
            ? { data: { organization_id: "org-1", role }, error: null }
            : {
                data: { display_name: "Agent", mfa_enrolled: mfaEnrolled },
                error: null,
              }
        ),
      };
      return builder;
    }),
  };
  mockedAdmin.mockReturnValue(admin as never);
  mockedClient.mockResolvedValue({
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(async () => ({
          data: { currentLevel: "aal1" },
        })),
      },
    },
  } as never);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  cookieStore.value = undefined;
});

describe("admin authorization", () => {
  test("feature off returns not found for pages", async () => {
    vi.stubEnv("HELP_DESK_ADMIN_DASHBOARD_ENABLED", "false");
    await expect(requireAdminPage("/admin/operations")).rejects.toThrow(
      "NOT_FOUND"
    );
  });

  test("no user returns API 401 and redirects pages", async () => {
    vi.stubEnv("HELP_DESK_ADMIN_DASHBOARD_ENABLED", "true");
    mockedUser.mockResolvedValue(null);
    const response = await requireAdminApi();
    expect(response instanceof Response ? response.status : 0).toBe(401);
    await expect(requireAdminPage("/admin/operations")).rejects.toThrow(
      /REDIRECT/
    );
  });

  test.each(["admin", "support_agent"] as const)(
    "allows %s members",
    async (role) => {
      const userId = "user-1";
      const secret = "test-secret";
      vi.stubEnv("HELP_DESK_ADMIN_DASHBOARD_ENABLED", "true");
      vi.stubEnv("HELP_DESK_ADMIN_SESSION_SECRET", secret);
      mockedUser.mockResolvedValue({
        id: userId,
        email: "agent@example.com",
      } as never);
      configureMembership(role);
      cookieStore.value = sessionCookie(userId, Date.now() + 60_000, secret);
      await expect(getAdminSession()).resolves.toMatchObject({
        role,
        organizationId: "org-1",
      });
    }
  );

  test("expired cookie is treated as logged out", async () => {
    vi.stubEnv("HELP_DESK_ADMIN_DASHBOARD_ENABLED", "true");
    vi.stubEnv("HELP_DESK_ADMIN_SESSION_SECRET", "test-secret");
    mockedUser.mockResolvedValue({
      id: "user-1",
      email: "agent@example.com",
    } as never);
    configureMembership();
    cookieStore.value = sessionCookie("user-1", Date.now() - 1, "test-secret");
    await expect(getAdminSession()).resolves.toBeNull();
  });

  test("authenticated non-members receive API 403", async () => {
    vi.stubEnv("HELP_DESK_ADMIN_DASHBOARD_ENABLED", "true");
    mockedUser.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
    } as never);
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
      })),
    };
    mockedAdmin.mockReturnValue(admin as never);
    expect(((await requireAdminApi()) as Response).status).toBe(403);
  });

  test("enrolled MFA requires AAL2", async () => {
    vi.stubEnv("HELP_DESK_ADMIN_DASHBOARD_ENABLED", "true");
    vi.stubEnv("HELP_DESK_ADMIN_SESSION_SECRET", "test-secret");
    mockedUser.mockResolvedValue({
      id: "user-1",
      email: "agent@example.com",
    } as never);
    configureMembership("admin", true);
    cookieStore.value = sessionCookie(
      "user-1",
      Date.now() + 60_000,
      "test-secret"
    );
    await expect(getAdminSession()).resolves.toBeNull();
  });
});
