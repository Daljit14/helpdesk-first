"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Lightbulb, RefreshCw, Search, ListChecks, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusResponse = {
  ok: boolean;
  checks: Record<string, { ok: boolean; ms: number | null }>;
  timestamp: string;
};

const CHECK_LABELS: Record<string, string> = {
  app: "Help desk",
  database: "Database",
};

/** Live mini status card fed by /api/status; refreshes every 30 seconds. */
export function SystemStatusCard({ className }: { className?: string }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) throw new Error("status");
        setStatus((await res.json()) as StatusResponse);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setCheckedAt(Date.now());
      }
    }
    void load();
    const refresh = window.setInterval(load, 30_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
      window.clearInterval(tick);
    };
  }, []);

  const healthy = Boolean(status?.ok) && !failed;
  const label = !checkedAt
    ? "Checking…"
    : failed
      ? "Unavailable"
      : healthy
        ? "All good"
        : "Degraded";
  const dbMs = status?.checks.database?.ms ?? null;
  const seconds = checkedAt
    ? Math.max(0, Math.round((now - checkedAt) / 1000))
    : 0;

  return (
    <section
      aria-labelledby="home-status-heading"
      className={cn(
        "flex flex-col gap-4 rounded-[28px] border border-border bg-card p-6 shadow-sm",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-status-heading" className="text-lg font-extrabold">
          System status
        </h2>
        <span
          role="status"
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-extrabold",
            healthy
              ? "bg-[color-mix(in_srgb,var(--status-success)_15%,transparent)] text-[color-mix(in_srgb,var(--status-success)_80%,var(--foreground))]"
              : "bg-muted text-muted-foreground"
          )}
        >
          <span className="relative h-2 w-2">
            {healthy && (
              <span className="hf-ping absolute inset-0 rounded-full bg-status-success" />
            )}
            <span
              className={cn(
                "absolute inset-0 rounded-full",
                healthy ? "bg-status-success" : "bg-muted-foreground"
              )}
            />
          </span>
          {label}
        </span>
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-muted p-3">
        <svg
          width="112"
          height="36"
          viewBox="0 0 120 40"
          aria-hidden
          className="shrink-0"
        >
          <path
            d="M0 26 L24 26 L30 10 L36 34 L42 20 L48 26 L70 26 L76 14 L82 30 L88 26 L120 26"
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={healthy ? "hf-draw" : undefined}
          />
        </svg>
        <span className="flex flex-col">
          <span className="text-xs font-bold text-muted-foreground">
            Database response
          </span>
          <span className="text-lg font-extrabold">
            {dbMs === null ? "—" : `${dbMs} ms`}
          </span>
        </span>
      </div>

      <ul className="grid gap-1.5 text-sm font-semibold">
        {Object.entries(
          (status?.checks ?? { app: null, database: null }) as Record<
            string,
            { ok: boolean; ms: number | null } | null
          >
        ).map(([key, check]) => (
          <li
            key={key}
            className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-muted"
          >
            <span>{CHECK_LABELS[key] ?? key}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-extrabold",
                check?.ok
                  ? "text-[color-mix(in_srgb,var(--status-success)_80%,var(--foreground))]"
                  : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  check?.ok
                    ? "hf-pulse bg-status-success"
                    : "bg-muted-foreground"
                )}
              />
              {check === null ? "Checking…" : check.ok ? "Operational" : "Down"}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center justify-between text-xs font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <RefreshCw className="hf-spin-slow h-3 w-3" aria-hidden />
          {checkedAt ? `Checked ${seconds}s ago` : "Checking…"}
        </span>
        <Link href="/status" className="font-bold text-primary hover:underline">
          Status page
        </Link>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "Describe it",
    body: "Type the problem in your own words, or pick a category.",
    icon: Search,
  },
  {
    title: "Follow safe steps",
    body: "One step at a time, made for your device.",
    icon: ListChecks,
  },
  {
    title: "Fixed, or get a person",
    body: "Still broken? Send a ticket — your steps go with it.",
    icon: Ticket,
  },
];

/** Three-step explainer; the highlighted step cycles every two seconds. */
export function HowItWorks({ className }: { className?: string }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setActive((value) => (value + 1) % STEPS.length),
      2000
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <section
      aria-labelledby="how-it-works-heading"
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-border bg-card p-7 shadow-sm",
        className
      )}
    >
      <h2 id="how-it-works-heading" className="text-lg font-extrabold">
        How HelpDesk First works
      </h2>
      <svg
        aria-hidden
        className="pointer-events-none absolute left-0 top-[104px] hidden h-1 w-full overflow-visible sm:block"
      >
        <line
          x1="12%"
          y1="2"
          x2="80%"
          y2="2"
          stroke="var(--secondary)"
          strokeWidth={2}
          strokeDasharray="6 6"
          className="hf-dash"
        />
      </svg>
      <ol className="relative mt-6 grid gap-6 sm:grid-cols-3">
        {STEPS.map(({ title, body, icon: Icon }, index) => (
          <li key={title} className="flex flex-col items-start gap-2.5">
            <span
              key={active === index ? `on-${title}` : `off-${title}`}
              className={cn(
                "flex h-[52px] w-[52px] items-center justify-center rounded-2xl",
                active === index
                  ? "hf-pop bg-primary text-primary-foreground shadow-[0_12px_24px_-10px_var(--primary)]"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-xs font-extrabold text-muted-foreground">
              Step {index + 1}
            </span>
            <span className="text-base font-extrabold">{title}</span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              {body}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const TIPS = [
  "Restarting fixes more problems than you’d think — try it before anything else.",
  "Note any error code on screen. It helps the guide (and IT) pinpoint the issue fast.",
  "On a work laptop, don’t change settings you aren’t allowed to — open a ticket instead.",
  "Wi-Fi acting up? Forgetting the network and rejoining often clears it.",
];

/** Rotating quick tips; pauses while hovered or focused. */
export function QuickTips({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(
      () => setIndex((value) => (value + 1) % TIPS.length),
      5000
    );
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <section
      aria-labelledby="quick-tip-heading"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "flex flex-col gap-3 rounded-[28px] border border-[#f7e3d2] bg-[linear-gradient(150deg,#fff7e6,#fff0f6)] p-6 text-[#3b2a1a] dark:border-[#4a3520] dark:bg-[linear-gradient(150deg,#2e2214,#2e1a28)] dark:text-[#ffe9c9]",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <h2
          id="quick-tip-heading"
          className="inline-flex items-center gap-2 text-sm font-extrabold text-[#8a5200] dark:text-[#ffd68a]"
        >
          <Lightbulb className="hf-glow h-[18px] w-[18px]" aria-hidden />
          Quick tip
        </h2>
        <span className="text-xs font-bold opacity-80">
          {index + 1} / {TIPS.length}
        </span>
      </div>
      <p
        key={index}
        aria-live="polite"
        className="hf-swap min-h-24 text-base font-semibold leading-relaxed"
      >
        {TIPS[index]}
      </p>
      <div className="flex items-center gap-1.5">
        {TIPS.map((tip, i) => (
          <button
            key={tip}
            type="button"
            aria-label={`Show tip ${i + 1}`}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
            className="flex h-6 flex-1 items-center"
          >
            <span className="relative block h-1 w-full overflow-hidden rounded-full bg-[#f3dcc3] dark:bg-[#4a3520]">
              {i === index && (
                <span
                  key={`${index}-${paused}`}
                  className="absolute inset-0 origin-left rounded-full bg-[#f59e0b]"
                  style={{
                    animation: paused ? undefined : "hf-fill 5s linear both",
                  }}
                />
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
