import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const { getAdminSession, isSupabaseConfigured, createAdminClient } = vi.hoisted(
  () => ({
    getAdminSession: vi.fn(),
    isSupabaseConfigured: vi.fn(),
    createAdminClient: vi.fn(),
  })
);

vi.mock("@/lib/admin/auth", () => ({ getAdminSession }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

function setupSupabase({
  failedNotifications = 0,
}: { failedNotifications?: number } = {}) {
  createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      let status = "";
      let ordered = false;
      let ranged = false;
      const result = () => {
        if (table === "tickets") {
          return ordered
            ? {
                data: [{ created_at: "2025-01-01T00:00:00.000Z" }],
                error: null,
              }
            : {
                data: null,
                error: null,
                count: status ? 2 : 3,
              };
        }
        if (table === "admin_auth_users")
          return { data: null, error: null, count: ranged ? 2 : 10 };
        if (table === "ticket_attachments")
          return { data: null, error: null, count: ranged ? 1 : 4 };
        if (table === "ai_provider_calls")
          return { data: null, error: null, count: 3 };
        if (table === "notification_outbox")
          return {
            data: null,
            error: null,
            count: status === "failed" ? failedNotifications : 0,
          };
        return { data: null, error: null, count: 0 };
      };
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((_key: string, value: string) => {
          status = value;
          return chain;
        }),
        not: vi.fn(() => chain),
        gte: vi.fn(() => {
          ranged = true;
          return chain;
        }),
        order: vi.fn(() => {
          ordered = true;
          return chain;
        }),
        limit: vi.fn(() => Promise.resolve(result())),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
          Promise.resolve(resolve(result())),
      };
      return chain;
    }),
  });
}

function setupEnvironment({ admin = true }: { admin?: boolean } = {}) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("NODE_ENV", "test");
  isSupabaseConfigured.mockReturnValue(true);
  getAdminSession.mockResolvedValue(
    admin
      ? {
          userId: "admin-user",
          email: "admin@example.com",
          role: "org_admin",
          organizationId: "org-1",
          displayName: "Admin",
          isPlatformAdmin: true,
        }
      : null
  );
  setupSupabase();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("status endpoint", () => {
  test("returns all checks when dependencies are healthy", async () => {
    setupEnvironment();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.degraded).toBe(true);
    expect(body.checks).toMatchObject({
      app: {
        ok: true,
        ms: null,
        detail: "Pages and API responding",
        facts: [
          { label: "Region", value: "local" },
          { label: "Version", value: "dev" },
        ],
      },
      database: { ok: true },
      auth: { ok: true },
      storage: { ok: true },
      ai: {
        ok: true,
        ms: null,
        detail: "Limited (mock provider)",
        facts: [
          { label: "Provider", value: "mock" },
          { label: "Model", value: expect.any(String) },
          { label: "Answers today", value: "3" },
        ],
      },
      notifications: {
        ok: true,
        detail: "0 sent · 0 queued · 0 failed (24h)",
        facts: [
          { label: "Sent (24h)", value: "0" },
          { label: "Queued", value: "0" },
          { label: "Failed", value: "0" },
        ],
      },
      rateLimiter: {
        ok: true,
        ms: null,
        detail: "Abuse protection on (memory)",
        facts: [{ label: "Backend", value: "memory" }],
      },
    });
    expect(body.checks.database.facts).toHaveLength(3);
    expect(body.checks.auth.facts).toEqual([
      { label: "Accounts", value: "10" },
      { label: "Signed in today", value: "2" },
    ]);
    expect(body.checks.storage.facts).toEqual([
      { label: "Files stored", value: "4" },
      { label: "Uploaded (24h)", value: "1" },
    ]);
  });

  test("strips internal status details for unauthenticated callers", async () => {
    setupEnvironment({ admin: false });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    );

    const body = await (await GET()).json();

    for (const check of Object.values(body.checks) as Record<
      string,
      unknown
    >[]) {
      expect(Object.keys(check).sort()).toEqual(["degraded", "ms", "ok"]);
      expect(check.ms).toBeNull();
      expect(check).not.toHaveProperty("facts");
      expect(check).not.toHaveProperty("detail");
    }
  });

  test("reports a failed authentication health check", async () => {
    setupEnvironment();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          new Response(null, { status: url.includes("/auth/") ? 503 : 200 })
        )
      )
    );

    const body = await (await GET()).json();

    expect(body.ok).toBe(false);
    expect(body.checks.auth).toMatchObject({ ok: false, detail: "HTTP 503" });
  });

  test("reports failed notifications without exposing rows", async () => {
    setupEnvironment();
    setupSupabase({ failedNotifications: 2 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    );

    const body = await (await GET()).json();

    expect(body.ok).toBe(false);
    expect(body.checks.notifications).toMatchObject({
      ok: false,
      detail: "0 sent · 0 queued · 2 failed (24h)",
    });
    expect(JSON.stringify(body)).not.toContain("notification_outbox");
  });

  test("fails health checks that time out", async () => {
    setupEnvironment();
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            options.signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          })
      )
    );

    const pending = GET();
    await vi.advanceTimersByTimeAsync(4_000);
    const body = await (await pending).json();

    expect(body.ok).toBe(false);
    expect(body.checks.auth).toMatchObject({ ok: false, detail: "Timed out" });
    expect(body.checks.storage).toMatchObject({
      ok: false,
      detail: "Timed out",
    });
  });

  test("rate limits the 31st request from an IP", async () => {
    setupEnvironment();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    );

    const requests = Array.from(
      { length: 31 },
      () =>
        new Request("https://helpdesk.example/api/status", {
          headers: { "x-forwarded-for": "status-test-ip" },
        })
    );
    const responses = [];
    for (const request of requests) responses.push(await GET(request));

    expect(
      responses.slice(0, 30).every((response) => response.status === 200)
    ).toBe(true);
    expect(responses[30].status).toBe(429);
    expect(responses[30].headers.get("Retry-After")).toMatch(/^\d+$/);
  });
});
