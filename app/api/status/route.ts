import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession } from "@/lib/admin/auth";
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
  facts?: { label: string; value: string }[];
  degraded?: boolean;
};

const FETCH_TIMEOUT_MS = 4_000;
const statusLimiter = createRateLimiter(
  { windowMs: 60_000, maxRequests: 30 },
  "status"
);

function startOfToday() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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
    const admin = createAdminClient();
    const [tickets, openTickets, latestTicket] = await Promise.all([
      admin.from("tickets").select("id", { count: "exact", head: true }),
      admin
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .not("status", "in", '("Resolved","Closed")'),
      admin
        .from("tickets")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    if (tickets.error)
      return { ok: false, ms: Date.now() - start, detail: "Unavailable" };
    const facts = [
      { label: "Tickets", value: String(tickets.count ?? 0) },
      ...(!openTickets.error
        ? [{ label: "Open tickets", value: String(openTickets.count ?? 0) }]
        : []),
      ...(!latestTicket.error && latestTicket.data?.[0]?.created_at
        ? [
            {
              label: "Last ticket",
              value: relativeTime(latestTicket.data[0].created_at),
            },
          ]
        : []),
    ];
    return {
      ok: true,
      ms: Date.now() - start,
      detail: `Connected · ${tickets.count ?? 0} tickets`,
      facts,
    };
  } catch {
    return { ok: false, ms: Date.now() - start, detail: "Unavailable" };
  }
}

async function authCheck(url: string, apiKey: string): Promise<StatusCheck> {
  const health = await fetchHealth(url, apiKey);
  const facts: { label: string; value: string }[] = [];
  try {
    const admin = createAdminClient();
    const [accounts, signedIn] = await Promise.all([
      admin
        .from("admin_auth_users")
        .select("id", { count: "exact", head: true }),
      admin
        .from("admin_auth_users")
        .select("id", { count: "exact", head: true })
        .gte("last_sign_in_at", startOfToday()),
    ]);
    if (!accounts.error)
      facts.push({ label: "Accounts", value: String(accounts.count ?? 0) });
    if (!signedIn.error)
      facts.push({
        label: "Signed in today",
        value: String(signedIn.count ?? 0),
      });
  } catch {
    // The projection is optional; the health check remains useful without it.
  }
  return {
    ...health,
    detail: health.ok ? "Sign-in working" : health.detail,
    ...(facts.length ? { facts } : {}),
  };
}

async function storageCheck(url: string, apiKey: string): Promise<StatusCheck> {
  const health = await fetchHealth(url, apiKey);
  const facts: { label: string; value: string }[] = [];
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [files, uploaded] = await Promise.all([
      admin
        .from("ticket_attachments")
        .select("id", { count: "exact", head: true }),
      admin
        .from("ticket_attachments")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
    ]);
    if (!files.error)
      facts.push({ label: "Files stored", value: String(files.count ?? 0) });
    if (!uploaded.error)
      facts.push({
        label: "Uploaded (24h)",
        value: String(uploaded.count ?? 0),
      });
  } catch {
    // Storage health does not depend on attachment metadata being available.
  }
  return {
    ...health,
    detail: health.ok ? "Uploads working" : health.detail,
    ...(facts.length ? { facts } : {}),
  };
}

async function notificationCheck(): Promise<StatusCheck> {
  const start = Date.now();
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [sent, pending, failed] = await Promise.all([
      admin
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("created_at", since),
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
    if (sent.error || pending.error || failed.error) {
      return { ok: true, ms: Date.now() - start, detail: "Not configured" };
    }
    const sentCount = sent.count ?? 0;
    const pendingCount = pending.count ?? 0;
    const failedCount = failed.count ?? 0;
    return {
      ok: failedCount === 0,
      degraded: pendingCount > 50,
      ms: Date.now() - start,
      detail: `${sentCount} sent · ${pendingCount} queued · ${failedCount} failed (24h)`,
      facts: [
        { label: "Sent (24h)", value: String(sentCount) },
        { label: "Queued", value: String(pendingCount) },
        { label: "Failed", value: String(failedCount) },
      ],
    };
  } catch {
    return { ok: true, ms: null, detail: "Not configured" };
  }
}

async function aiCheck(): Promise<StatusCheck> {
  const kind = getAiProviderKind();
  const model = getAiModel();
  const apiConfigured = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const facts: { label: string; value: string }[] = [
    { label: "Provider", value: kind },
    { label: "Model", value: model },
  ];
  try {
    const answers = await createAdminClient()
      .from("ai_provider_calls")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfToday());
    if (!answers.error)
      facts.push({
        label: "Answers today",
        value: String(answers.count ?? 0),
      });
  } catch {
    // Provider status remains useful when telemetry is unavailable.
  }
  if (
    kind === "mock" ||
    ((kind === "anthropic" || kind === "shadow") && !apiConfigured)
  ) {
    return {
      ok: true,
      degraded: true,
      ms: null,
      detail: "Limited (mock provider)",
      facts,
    };
  }
  return {
    ok: true,
    degraded: false,
    ms: null,
    detail: `${kind} · ${model}`,
    facts,
  };
}

function rateLimiterCheck(): StatusCheck {
  const kind = getRateLimiterKind() ?? "memory";
  return {
    ok: true,
    degraded: kind === "memory" && process.env.NODE_ENV === "production",
    ms: null,
    detail: `Abuse protection on (${kind})`,
    facts: [{ label: "Backend", value: kind }],
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
      ? authCheck(`${baseUrl}/auth/v1/health`, anonKey)
      : Promise.resolve({ ok: false, ms: null, detail: "Not configured" }),
    configured && baseUrl && anonKey
      ? storageCheck(`${baseUrl}/storage/v1/version`, anonKey)
      : Promise.resolve({ ok: false, ms: null, detail: "Not configured" }),
    aiCheck(),
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
    app: {
      ok: true,
      ms: null,
      detail: "Pages and API responding",
      facts: [
        {
          label: "Region",
          value: process.env.VERCEL_REGION ?? "local",
        },
        {
          label: "Version",
          value: (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7),
        },
      ],
    },
    database,
    auth,
    storage,
    ai,
    notifications,
    rateLimiter,
  };
  const allOk = Object.values(checks).every((check) => check.ok);
  const degraded = Object.values(checks).some((check) => check.degraded);
  let adminSession = null;
  try {
    adminSession = await getAdminSession();
  } catch {
    adminSession = null;
  }
  const responseChecks = adminSession
    ? checks
    : Object.fromEntries(
        Object.entries(checks).map(([name, check]) => [
          name,
          {
            ok: check.ok,
            degraded: Boolean(check.degraded),
            ms: null,
          },
        ])
      );

  return Response.json(
    {
      ok: allOk,
      degraded,
      checks: responseChecks,
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
