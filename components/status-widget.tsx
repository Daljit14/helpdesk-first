"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type StatusCheck = {
  ok: boolean;
  ms: number | null;
  detail?: string;
  degraded?: boolean;
};

type StatusResponse = {
  ok: boolean;
  degraded?: boolean;
  checks: Record<string, StatusCheck>;
  timestamp: string;
};

const serviceNames: Record<string, string> = {
  app: "App",
  database: "Database",
  auth: "Authentication",
  storage: "File storage",
  ai: "AI assistant",
  notifications: "Notifications",
  rateLimiter: "Rate limiting",
};

function statusClass(check: StatusCheck) {
  if (!check.ok) return "bg-destructive";
  if (check.degraded) return "bg-status-warning";
  return "bg-status-success";
}

function statusLabel(check: StatusCheck) {
  if (!check.ok) return "Down";
  if (check.degraded) return "Degraded";
  return "Operational";
}

function formatDuration(value: number) {
  return `${Math.round(value)}ms`;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2)
    return (
      <p className="text-sm text-muted-foreground">Waiting for more checks…</p>
    );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map(
      (value, index) =>
        `${(index / (values.length - 1)) * 100},${100 - ((value - min) / range) * 80 - 10}`
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-20 w-full overflow-visible text-primary"
      role="img"
      aria-label="Database response time sparkline"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function StatusWidget() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);
  const [history, setHistory] = useState<number[]>([]);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) {
        setRequestFailed(true);
        setStatus(null);
      } else {
        const nextStatus = (await res.json()) as StatusResponse;
        setRequestFailed(false);
        setStatus(nextStatus);
        const databaseMs = nextStatus.checks.database?.ms;
        if (databaseMs !== null && databaseMs !== undefined) {
          setHistory((current) => {
            const next = [...current, databaseMs].slice(-30);
            window.localStorage.setItem(
              "hf-status-history",
              JSON.stringify(next)
            );
            return next;
          });
        }
      }
      setLastChecked(new Date().toISOString());
    } catch {
      setStatus(null);
      setRequestFailed(true);
      setLastChecked(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem("hf-status-history") ?? "[]"
      );
      if (Array.isArray(saved)) {
        const values = saved
          .filter((value): value is number => typeof value === "number")
          .slice(-30);
        const timeout = window.setTimeout(() => setHistory(values), 0);
        return () => window.clearTimeout(timeout);
      }
    } catch {
      window.localStorage.removeItem("hf-status-history");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void check(), 0);
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(refresh);
    };
  }, [check]);

  const historyStats = useMemo(() => {
    if (!history.length) return null;
    return {
      min: Math.min(...history),
      avg: history.reduce((sum, value) => sum + value, 0) / history.length,
      max: Math.max(...history),
    };
  }, [history]);

  const overallLabel = loading
    ? "Checking…"
    : requestFailed
      ? "Unavailable"
      : status?.ok
        ? status.degraded
          ? "Degraded"
          : "Healthy"
        : "Unavailable";
  const overallClass =
    requestFailed || (status && !status.ok)
      ? "bg-destructive/10 text-destructive"
      : status?.degraded
        ? "bg-status-warning/20 text-foreground"
        : "bg-status-success/20 text-foreground";

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${overallClass}`}
          >
            {overallLabel}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void check()}
            disabled={loading}
            aria-label="Refresh system status"
            aria-busy={loading}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
        <span role="status" aria-live="polite" className="sr-only">
          {loading
            ? "Checking system status…"
            : lastChecked
              ? `Status updated ${new Date(lastChecked).toLocaleTimeString()}`
              : ""}
        </span>
        {lastChecked && (
          <p className="mt-3 text-xs text-muted-foreground">
            Last checked {new Date(lastChecked).toLocaleTimeString()}
          </p>
        )}
        {status && (
          <ul className="mt-5 space-y-3">
            {Object.entries(status.checks).map(([name, check]) => (
              <li
                key={name}
                className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusClass(check)}`}
                  />
                  <span>{serviceNames[name] ?? name}</span>
                </span>
                <span className="text-right text-sm text-muted-foreground">
                  <span className="block">
                    {check.detail ?? statusLabel(check)}
                  </span>
                  {check.ms !== null && <span>{formatDuration(check.ms)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">
            Database response time (this browser&apos;s checks)
          </h2>
          <div className="mt-4">
            <Sparkline values={history} />
          </div>
          {historyStats && (
            <dl className="mt-3 grid grid-cols-3 gap-3 text-xs text-muted-foreground">
              <div>
                <dt>Min</dt>
                <dd className="font-medium text-foreground">
                  {formatDuration(historyStats.min)}
                </dd>
              </div>
              <div>
                <dt>Avg</dt>
                <dd className="font-medium text-foreground">
                  {formatDuration(historyStats.avg)}
                </dd>
              </div>
              <div>
                <dt>Max</dt>
                <dd className="font-medium text-foreground">
                  {formatDuration(historyStats.max)}
                </dd>
              </div>
            </dl>
          )}
        </section>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">What to do if something is down</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <Link className="text-primary hover:underline" href="/browse">
                Browse troubleshooting guides
              </Link>{" "}
              for a self-service fix.
            </li>
            <li>
              <Link className="text-primary hover:underline" href="/assistant">
                Ask the assistant
              </Link>{" "}
              for guided help.
            </li>
            <li>
              <Link
                className="text-primary hover:underline"
                href="/assistant?intent=human"
              >
                Contact support
              </Link>{" "}
              if you still need a person.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
