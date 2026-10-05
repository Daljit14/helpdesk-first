"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Bot,
  Database,
  Gauge,
  HardDrive,
  KeyRound,
  Loader2,
  MonitorSmartphone,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Sparkline } from "@/components/admin/ops/visuals";

type Check = {
  ok: boolean;
  ms: number | null;
  detail?: string;
  facts?: { label: string; value: string }[];
  degraded?: boolean;
};
type StatusBody = {
  ok: boolean;
  degraded?: boolean;
  checks: Record<string, Check>;
  timestamp: string;
};
type Sample = {
  at: number;
  state: "ok" | "degraded" | "down";
  ms: Record<string, number | null>;
};

const SERVICES: {
  key: string;
  label: string;
  icon: LucideIcon;
  about: string;
}[] = [
  {
    key: "app",
    label: "Web app",
    icon: MonitorSmartphone,
    about: "Pages and API routes",
  },
  {
    key: "database",
    label: "Database",
    icon: Database,
    about: "Supabase Postgres",
  },
  { key: "auth", label: "Sign-in", icon: KeyRound, about: "Supabase Auth" },
  {
    key: "storage",
    label: "File storage",
    icon: HardDrive,
    about: "Attachments bucket",
  },
  { key: "ai", label: "AI assistant", icon: Bot, about: "Model provider" },
  {
    key: "notifications",
    label: "Notifications",
    icon: Bell,
    about: "Email outbox",
  },
  {
    key: "rateLimiter",
    label: "Rate limiter",
    icon: Gauge,
    about: "Abuse protection",
  },
];

const HISTORY = 30;
const POLL_MS = 30_000;

function stateOf(check: Check | undefined) {
  if (!check) return "down" as const;
  if (!check.ok) return "down" as const;
  return check.degraded ? ("degraded" as const) : ("ok" as const);
}

const STATE_STYLE = {
  ok: {
    dot: "bg-status-success",
    text: "text-status-success",
    label: "Operational",
    ring: "border-status-success/30",
  },
  degraded: {
    dot: "bg-status-warning",
    text: "text-status-warning",
    label: "Degraded",
    ring: "border-status-warning/40",
  },
  down: {
    dot: "bg-status-danger",
    text: "text-status-danger",
    label: "Down",
    ring: "border-status-danger/40",
  },
} as const;

/** Live, animated health board for admins. Polls /api/status every 30s. */
export function SystemStatusPanel() {
  const [data, setData] = useState<StatusBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Sample[]>([]);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      if (response.status === 429)
        throw new Error("Checking too often — try again in a minute.");
      if (!response.ok) throw new Error("Status check failed.");
      const body = (await response.json()) as StatusBody;
      setData(body);
      setError(null);
      const overall = body.ok ? (body.degraded ? "degraded" : "ok") : "down";
      setHistory((current) =>
        [
          ...current,
          {
            at: Date.parse(body.timestamp) || Date.now(),
            state: overall,
            ms: Object.fromEntries(
              Object.entries(body.checks).map(([key, check]) => [key, check.ms])
            ),
          } satisfies Sample,
        ].slice(-HISTORY)
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Status check failed."
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  const overall = data
    ? data.ok
      ? data.degraded
        ? "degraded"
        : "ok"
      : "down"
    : null;
  const headline =
    overall === "ok"
      ? "All systems operational"
      : overall === "degraded"
        ? "Running with warnings"
        : overall === "down"
          ? "Something needs attention"
          : "Checking every service…";
  const orb =
    overall === "ok"
      ? "from-[#34d399] to-[#059669]"
      : overall === "degraded"
        ? "from-[#fbbf24] to-[#d97706]"
        : overall === "down"
          ? "from-[#fb7185] to-[#e11d48]"
          : "from-[#a5b4fc] to-[#6366f1]";
  const counts = SERVICES.reduce(
    (acc, service) => {
      acc[stateOf(data?.checks[service.key])] += data ? 1 : 0;
      return acc;
    },
    { ok: 0, degraded: 0, down: 0 }
  );
  const uptime = history.length
    ? Math.round(
        (history.filter((s) => s.state !== "down").length / history.length) *
          100
      )
    : null;

  return (
    <div className="space-y-5">
      <section className="glass hf-rise grid gap-6 overflow-hidden p-6 md:grid-cols-[auto_1fr] md:items-center">
        <div
          className="relative mx-auto flex h-40 w-40 items-center justify-center"
          aria-hidden
        >
          <span
            className={`absolute inset-0 rounded-full bg-gradient-to-br ${orb} opacity-20 hf-ping`}
          />
          <span
            className={`absolute inset-4 rounded-full bg-gradient-to-br ${orb} opacity-30 hf-ping`}
            style={{ animationDelay: "0.6s" }}
          />
          <span className="absolute inset-1 rounded-full border-2 border-dashed border-primary/25" />
          <span
            className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br ${orb} text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.35)]`}
          >
            {loading && !data ? (
              <Loader2 className="h-9 w-9 animate-spin" />
            ) : (
              <span className="text-2xl font-extrabold">
                {data ? `${counts.ok}/${SERVICES.length}` : "…"}
              </span>
            )}
          </span>
        </div>
        <div className="space-y-3 text-center md:text-left">
          <p
            className="text-sm font-bold text-muted-foreground"
            aria-live="polite"
          >
            {data
              ? `Last checked ${new Date(data.timestamp).toLocaleTimeString()}`
              : "Running first check"}
          </p>
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {headline}
          </h2>
          <div className="flex flex-wrap justify-center gap-2 md:justify-start">
            <span className="rounded-full bg-status-success/15 px-3 py-1 text-xs font-extrabold text-status-success">
              {counts.ok} operational
            </span>
            <span className="rounded-full bg-status-warning/15 px-3 py-1 text-xs font-extrabold text-status-warning">
              {counts.degraded} degraded
            </span>
            <span className="rounded-full bg-status-danger/15 px-3 py-1 text-xs font-extrabold text-status-danger">
              {counts.down} down
            </span>
            {uptime !== null && (
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-extrabold text-secondary-foreground">
                {uptime}% healthy this session
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
            Check now
          </button>
          {error && (
            <p role="alert" className="text-sm font-bold text-status-danger">
              {error}
            </p>
          )}
        </div>
      </section>

      <section
        aria-label="Services"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {SERVICES.map((service, index) => {
          const check = data?.checks[service.key];
          const state = data ? stateOf(check) : null;
          const style = state ? STATE_STYLE[state] : null;
          const latencies = history
            .map((sample) => sample.ms[service.key])
            .filter((value): value is number => typeof value === "number");
          return (
            <article
              key={service.key}
              className={`glass hf-adm-card hf-rise flex flex-col gap-3 p-4 ${style?.ring ?? ""}`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <service.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-sm font-extrabold">
                      {service.label}
                    </span>
                    <span className="block text-[11px] font-semibold text-muted-foreground">
                      {service.about}
                    </span>
                  </span>
                </span>
                <span
                  className={`relative h-3 w-3 ${style ? "" : "opacity-40"}`}
                  aria-hidden
                >
                  <span
                    className={`hf-ping absolute inset-0 rounded-full ${style?.dot ?? "bg-muted-foreground"}`}
                  />
                  <span
                    className={`absolute inset-0 rounded-full ${style?.dot ?? "bg-muted-foreground"}`}
                  />
                </span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <span>
                  <span
                    className={`block text-sm font-extrabold ${style?.text ?? "text-muted-foreground"}`}
                  >
                    {style?.label ?? "Checking…"}
                  </span>
                  <span
                    className="block max-w-[180px] truncate text-xs text-muted-foreground"
                    title={check?.detail}
                  >
                    {check?.detail ?? "—"}
                  </span>
                </span>
                {typeof check?.ms === "number" && latencies.length > 1 && (
                  <Sparkline
                    points={latencies}
                    id={`status-${service.key}`}
                    width={84}
                    height={30}
                  />
                )}
              </div>
              {check?.facts?.length ? (
                <dl className="space-y-1.5 border-t border-border pt-3">
                  {check.facts.map((fact) => (
                    <div
                      key={fact.label}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <dt className="font-semibold text-muted-foreground">
                        {fact.label}
                      </dt>
                      <dd className="text-right font-extrabold">
                        {fact.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {typeof check?.ms === "number" && (
                <p className="text-[11px] font-bold text-muted-foreground">
                  Round trip {check.ms} ms
                </p>
              )}
            </article>
          );
        })}
      </section>

      <section className="glass hf-rise p-5" aria-labelledby="status-history">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="status-history" className="text-lg font-extrabold">
            Check history
          </h2>
          <span className="text-xs font-semibold text-muted-foreground">
            One bar per check · every 30 seconds while this page is open
          </span>
        </div>
        <div
          className="mt-4 flex h-12 items-end gap-1"
          role="img"
          aria-label={`${history.length} recent checks`}
        >
          {Array.from({ length: HISTORY }, (_, i) => {
            const sample = history[history.length - HISTORY + i];
            const color = !sample
              ? "bg-muted"
              : sample.state === "ok"
                ? "bg-status-success"
                : sample.state === "degraded"
                  ? "bg-status-warning"
                  : "bg-status-danger";
            return (
              <span
                key={i}
                title={
                  sample
                    ? `${new Date(sample.at).toLocaleTimeString()} · ${STATE_STYLE[sample.state].label}`
                    : "No check yet"
                }
                className={`hf-adm-rise-bar flex-1 rounded-md ${color}`}
                style={{
                  height: sample ? "100%" : "35%",
                  animationDelay: `${i * 0.015}s`,
                }}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
