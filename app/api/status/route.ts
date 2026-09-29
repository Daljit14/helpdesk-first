import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiModel, getAiProviderKind } from "@/lib/ai/config";
import {
  createRateLimiter,
  getClientIp,
  getRateLimiterKind,
} from "@/lib/ai/rate-limit";

export type StatusCheck = {
  ok: boolean;
  ms: number | null;
  detail?: string;
  degraded?: boolean;
};

const FETCH_TIMEOUT_MS = 4_000;
const statusLimiter = createRateLimiter(
  { windowMs: 60_000, maxRequests: 30 },
  "status"
);

async function fetchHealth(url: string, apiKey: string): Promise<StatusCheck> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { apikey: apiKey },
      cache: "no-store",
    });
    return {
      ok: response.ok,
      ms: Date.now() - start,
      detail: response.ok ? "Operational" : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - start,
      detail:
        error instanceof DOMException && error.name === "AbortError"
          ? "Timed out"
          : "Unavailable",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function databaseCheck(): Promise<StatusCheck> {
  const start = Date.now();
  if (!isSupabaseConfigured())
    return { ok: false, ms: null, detail: "Not configured" };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("guide_rating_totals")
      .select("issue_id", { head: true, count: "exact" })
      .limit(1);
    return {
      ok: !error,
      ms: Date.now() - start,
      detail: error ? "Unavailable" : "Operational",
    };
  } catch {
    return { ok: false, ms: Date.now() - start, detail: "Unavailable" };
  }
}

async function notificationCheck(): Promise<StatusCheck> {
  const start = Date.now();
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [pending, failed] = await Promise.all([
      admin
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .gte("created_at", since),
      admin
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", since),
    ]);
    if (pending.error || failed.error) {
      return { ok: true, ms: Date.now() - start, detail: "Not configured" };
    }
    const pendingCount = pending.count ?? 0;
    const failedCount = failed.count ?? 0;
    return {
      ok: failedCount === 0,
      degraded: pendingCount > 50,
      ms: Date.now() - start,
      detail: `${pendingCount} queued · ${failedCount} failed (24h)`,
    };
  } catch {
    return { ok: true, ms: null, detail: "Not configured" };
  }
}

function aiCheck(): StatusCheck {
  const kind = getAiProviderKind();
  const model = getAiModel();
  const apiConfigured = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (
    kind === "mock" ||
    ((kind === "anthropic" || kind === "shadow") && !apiConfigured)
  ) {
    return {
      ok: true,
      degraded: true,
      ms: 0,
      detail: "Mock provider",
    };
  }
  return { ok: true, degraded: false, ms: 0, detail: `${kind} · ${model}` };
}

function rateLimiterCheck(): StatusCheck {
  const kind = getRateLimiterKind() ?? "memory";
  return {
    ok: true,
    degraded: kind === "memory" && process.env.NODE_ENV === "production",
    ms: 0,
    detail: kind,
  };
}

export async function GET(request?: Request) {
  const rateLimit = await statusLimiter.check(
    getClientIp(request ?? new Request("http://localhost/api/status"))
  );
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Too many requests." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, rateLimit.retryAfter ?? 60)),
        },
      }
    );
  }
  const configured = isSupabaseConfigured();
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const results = await Promise.allSettled([
    databaseCheck(),
    configured && baseUrl && anonKey
      ? fetchHealth(`${baseUrl}/auth/v1/health`, anonKey)
      : Promise.resolve({ ok: false, ms: null, detail: "Not configured" }),
    configured && baseUrl && anonKey
      ? fetchHealth(`${baseUrl}/storage/v1/version`, anonKey)
      : Promise.resolve({ ok: false, ms: null, detail: "Not configured" }),
    Promise.resolve(aiCheck()),
    notificationCheck(),
    Promise.resolve(rateLimiterCheck()),
  ]);
  const unavailable = (): StatusCheck => ({
    ok: false,
    ms: null,
    detail: "Unavailable",
  });
  const value = (index: number) =>
    results[index]?.status === "fulfilled"
      ? results[index].value
      : unavailable();
  const database = value(0);
  const auth = value(1);
  const storage = value(2);
  const ai = value(3);
  const notifications = value(4);
  const rateLimiter = value(5);
  const checks: Record<string, StatusCheck> = {
    app: { ok: true, ms: 0 },
    database,
    auth,
    storage,
    ai,
    notifications,
    rateLimiter,
  };
  const allOk = Object.values(checks).every((check) => check.ok);
  const degraded = Object.values(checks).some((check) => check.degraded);

  return Response.json(
    { ok: allOk, degraded, checks, timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
