"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  app: "Help desk",
  database: "Database",
  auth: "Authentication",
  storage: "File storage",
  ai: "AI assistant",
  notifications: "Notifications",
  rateLimiter: "Rate limiting",
};

function formatDuration(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}ms`;
}

function useCountUp(target: number | null) {
  const [value, setValue] = useState(target ?? 0);
  const reducedMotion = useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== "function") return () => {};
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );

  useEffect(() => {
    if (target === null) return;
    if (reducedMotion) return;
    const start = performance.now();
    const from = value ?? 0;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / 400, 1);
      setValue(from + (target - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, target]);

  if (target === null) return null;
  if (reducedMotion) return Math.round(target);
  return Math.round(value);
}

function CheckRow({
  name,
  check,
  index,
}: {
  name: string;
  check: StatusCheck | null;
  index: number;
}) {
  const ms = useCountUp(check?.ms ?? null);
  const state = !check
    ? "Checking…"
    : !check.ok
      ? "Down"
      : check.degraded
        ? "Degraded"
        : "Operational";
  const unhealthy = Boolean(check && (!check.ok || check.degraded));

  return (
    <li
      className="hf-rise rounded-2xl border border-border bg-card p-4"
      style={{ animationDelay: `${index * 0.05}s` }}
      title={check?.detail ?? state}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5 font-bold">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {unhealthy && (
              <span className="hf-ping absolute inset-0 rounded-full bg-status-warning" />
            )}
            <span
              className={cn(
                "relative h-2.5 w-2.5 rounded-full",
                !check
                  ? "bg-muted-foreground"
                  : !check.ok
                    ? "bg-status-danger"
                    : check.degraded
                      ? "bg-status-warning"
                      : "bg-status-success"
              )}
            />
          </span>
          {serviceNames[name] ?? name}
        </span>
        <span className="shrink-0 text-sm font-extrabold text-muted-foreground">
          {formatDuration(ms)}
        </span>
      </div>
      <span className="mt-1 block pl-5 text-xs font-semibold text-muted-foreground">
        {state}
        <span className="sr-only">. {check?.detail ?? ""}</span>
      </span>
    </li>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 36 - ((value - min) / range) * 28 - 4;
      return `${x},${y}`;
    })
    .join(" ");
  const lastValue = values[values.length - 1];
  const lastY = 36 - ((lastValue - min) / range) * 28 - 4;
  return (
    <span className="flex h-10 items-center">
      <svg
        viewBox="0 0 100 36"
        preserveAspectRatio="none"
        className="h-10 w-32 overflow-hidden text-primary sm:w-44"
        role="img"
        aria-label="Status latency sparkline"
      >
        <polygon
          points={`${points} 100,36 0,36`}
          fill="currentColor"
          opacity=".12"
          className="hf-fill"
        />
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          className="hf-draw"
        />
        <circle
          cx="100"
          cy={lastY}
          r="2"
          fill="currentColor"
          className="hf-ping"
        />
      </svg>
    </span>
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
      if (!res.ok) throw new Error("status");
      const nextStatus = (await res.json()) as StatusResponse;
      setStatus(nextStatus);
      setRequestFailed(false);
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
    } catch {
      setStatus(null);
      setRequestFailed(true);
    } finally {
      setLastChecked(new Date().toISOString());
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
        queueMicrotask(() => setHistory(values));
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

  const overallDown = requestFailed || Boolean(status && !status.ok);
  const overallDegraded = Boolean(status?.degraded);
  const overallLabel = loading
    ? "Checking…"
    : overallDown
      ? "Unavailable"
      : overallDegraded
        ? "Degraded"
        : "All systems operational";

  const checks = Object.entries(
    status?.checks ?? { app: null, database: null }
  ) as Array<[string, StatusCheck | null]>;

  return (
    <div className="mt-8">
      <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-extrabold",
                overallDown
                  ? "bg-destructive/10 text-destructive"
                  : overallDegraded
                    ? "bg-status-warning/15 text-foreground"
                    : "bg-status-success/15 text-foreground"
              )}
            >
              <span className="relative flex h-2.5 w-2.5">
                {(overallDown || overallDegraded) && (
                  <span className="hf-ping absolute inset-0 rounded-full bg-status-warning" />
                )}
                <span
                  className={cn(
                    "relative h-2.5 w-2.5 rounded-full",
                    overallDown
                      ? "bg-status-danger"
                      : overallDegraded
                        ? "bg-status-warning"
                        : "bg-status-success"
                  )}
                />
              </span>
              {overallLabel}
            </span>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              {lastChecked
                ? `Last checked ${new Date(lastChecked).toLocaleTimeString()}`
                : "Waiting for first check"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Sparkline values={history} />
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
        </div>
      </section>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {checks.map(([name, check], index) => (
          <CheckRow key={name} name={name} check={check} index={index} />
        ))}
      </ul>

      <p className="mt-5 text-center text-xs font-semibold text-muted-foreground">
        Need help?{" "}
        <Link href="/browse" className="text-primary hover:underline">
          Browse guides
        </Link>{" "}
        ·{" "}
        <Link href="/assistant" className="text-primary hover:underline">
          Ask the assistant
        </Link>{" "}
        ·{" "}
        <Link
          href="/assistant?intent=human"
          className="text-primary hover:underline"
        >
          Contact support
        </Link>
      </p>
      <span role="status" aria-live="polite" className="sr-only">
        {loading
          ? "Checking system status…"
          : lastChecked
            ? `Status updated ${new Date(lastChecked).toLocaleTimeString()}`
            : ""}
      </span>
    </div>
  );
}
