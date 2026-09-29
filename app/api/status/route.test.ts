import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const { isSupabaseConfigured, createClient, createAdminClient } = vi.hoisted(
  () => ({
    isSupabaseConfigured: vi.fn(),
    createClient: vi.fn(),
    createAdminClient: vi.fn(),
  })
);

vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

function setupSupabase({
  failedNotifications = 0,
}: { failedNotifications?: number } = {}) {
  const databaseChain = {
    select: vi.fn(() => databaseChain),
    limit: vi.fn(() => Promise.resolve({ error: null })),
  };
  createClient.mockResolvedValue({
    from: vi.fn(() => databaseChain),
  });
  createAdminClient.mockReturnValue({
    from: vi.fn(() => {
      let status = "";
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((_key: string, value: string) => {
          status = value;
          return chain;
        }),
        gte: vi.fn(() =>
          Promise.resolve({
            error: null,
            count: status === "failed" ? failedNotifications : 0,
          })
        ),
      };
      return chain;
    }),
  });
}

function setupEnvironment() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.stubEnv("NODE_ENV", "test");
  isSupabaseConfigured.mockReturnValue(true);
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
      app: { ok: true },
      database: { ok: true },
      auth: { ok: true },
      storage: { ok: true },
      ai: { ok: true, detail: "Mock provider" },
      notifications: { ok: true, detail: "0 queued · 0 failed (24h)" },
      rateLimiter: { ok: true, detail: "memory" },
    });
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
      detail: "0 queued · 2 failed (24h)",
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
});
