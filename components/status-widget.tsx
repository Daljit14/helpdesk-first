"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Check,
  Headset,
  KeyRound,
  Mail,
  RefreshCw,
  Search,
  Ticket,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StatusCheck = {
  ok: boolean;
  degraded?: boolean;
  ms?: number | null;
};

type StatusResponse = {
  ok: boolean;
  degraded?: boolean;
  checks: Record<string, StatusCheck>;
  timestamp: string;
};

type CapabilityState = "ok" | "degraded" | "down" | "checking";

type CapabilityKey = "auth" | "browse" | "ai" | "tickets" | "email";

type Capability = {
  key: CapabilityKey;
  name: string;
  state: CapabilityState;
  text: string;
  ms: number | null;
};

type Sample = {
  t: number;
  overall: "ok" | "degraded" | "down";
  states: Record<CapabilityKey, CapabilityState>;
  ms: Record<CapabilityKey, number | null>;
};

const REFRESH_MS = 30_000;
const MAX_SAMPLES = 30;
const STORAGE_KEY = "hf-status-samples";

const CAPABILITY_ICONS: Record<CapabilityKey, LucideIcon> = {
  auth: KeyRound,
  browse: Search,
  ai: Bot,
  tickets: Ticket,
  email: Mail,
};

function stateFor(check: StatusCheck | undefined): CapabilityState {
  if (!check) return "checking";
  if (!check.ok) return "down";
  return check.degraded ? "degraded" : "ok";
}

function combinedState(
  ...checks: (StatusCheck | undefined)[]
): CapabilityState {
  if (checks.some((check) => !check)) return "checking";
  if (checks.some((check) => !check?.ok)) return "down";
  if (checks.some((check) => check?.degraded)) return "degraded";
  return "ok";
}

function stateLabel(state: CapabilityState) {
  return {
    ok: "Operational",
    degraded: "Degraded",
    down: "Unavailable",
    checking: "Checking…",
  }[state];
}

function latency(...checks: (StatusCheck | undefined)[]): number | null {
  const values = checks
    .map((check) => check?.ms)
    .filter((ms): ms is number => typeof ms === "number" && ms >= 0);
  return values.length ? Math.max(...values) : null;
}

function capabilityRows(
  checks: Record<string, StatusCheck> | undefined
): Capability[] {
  const auth = checks?.auth;
  const app = checks?.app;
  const database = checks?.database;
  const ai = checks?.ai;
  const storage = checks?.storage;
  const notifications = checks?.notifications;
  const authState = stateFor(auth);
  const browseState = combinedState(app, database);
  const aiState = stateFor(ai);
  const databaseState = stateFor(database);
  const storageState = stateFor(storage);
  const ticketState =
    databaseState === "down"
      ? "down"
      : storageState === "down" || databaseState === "degraded"
        ? "degraded"
        : databaseState === "checking" || storageState === "checking"
          ? "checking"
          : "ok";
  const notificationState = stateFor(notifications);

  return [
    {
      key: "auth",
      name: "Sign in & accounts",
      state: authState,
      ms: latency(auth),
      text:
        authState === "ok"
          ? "You can sign in normally"
          : authState === "checking"
            ? "Checking sign-in"
            : "Sign-in may fail — try again in a few minutes",
    },
    {
      key: "browse",
      name: "Browse guides & search",
      state: browseState,
      ms: latency(app, database),
      text:
        browseState === "ok"
          ? "Guides and search are available"
          : browseState === "checking"
            ? "Checking guides and search"
            : "Guides may load slowly",
    },
    {
      key: "ai",
      name: "AI assistant",
      state: aiState,
      ms: latency(ai),
      text:
        aiState === "ok"
          ? "Chat with the assistant is available"
          : aiState === "degraded"
            ? "Assistant gives limited answers right now"
            : aiState === "checking"
              ? "Checking the assistant"
              : "Assistant unavailable — use guides or contact support",
    },
    {
      key: "tickets",
      name: "Tickets & file uploads",
      state: ticketState,
      ms: latency(database, storage),
      text:
        ticketState === "ok"
          ? "You can submit tickets and attach screenshots"
          : ticketState === "checking"
            ? "Checking tickets and file uploads"
            : ticketState === "down"
              ? "Ticket submission unavailable"
              : "Uploads may fail — you can still submit a ticket without attachments",
    },
    {
      key: "email",
      name: "Email updates",
      state: notificationState,
      ms: latency(notifications),
      text:
        notificationState === "ok"
          ? "Ticket emails are being delivered"
          : notificationState === "checking"
            ? "Checking email updates"
            : "Emails may be delayed",
    },
  ];
}

function readSamples(): Sample[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as Sample[])
      .filter(
        (sample) =>
          sample &&
          typeof sample.t === "number" &&
          typeof sample.states === "object" &&
          sample.states !== null
      )
      .slice(-MAX_SAMPLES);
  } catch {
    return [];
  }
}

function writeSamples(samples: Sample[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch {
    // Storage can be unavailable (private mode, quota); history stays in memory.
  }
}

function sampleFrom(
  rows: Capability[],
  overall: Sample["overall"],
  t: number
): Sample {
  const states = {} as Record<CapabilityKey, CapabilityState>;
  const ms = {} as Record<CapabilityKey, number | null>;
  for (const row of rows) {
    states[row.key] = row.state;
    ms[row.key] = row.ms;
  }
  return { t, overall, states, ms };
}

/** Share of known service checks that were up (ok or degraded). */
function uptimePercent(samples: Sample[]): number | null {
  let up = 0;
  let known = 0;
  for (const sample of samples) {
    const states = Object.values(sample.states);
    if (sample.overall === "down" && states.every((s) => s === "checking")) {
      // The status request itself failed: count it as one outage.
      known += 1;
      continue;
    }
    for (const state of states) {
      if (state === "checking") continue;
      known += 1;
      if (state !== "down") up += 1;
    }
  }
  if (!known) return null;
  return Math.round((up / known) * 1000) / 10;
}

function trendWord(values: number[]): string {
  if (values.length < 2) return "not enough data yet";
  const half = Math.floor(values.length / 2);
  const avg = (list: number[]) =>
    list.reduce((sum, value) => sum + value, 0) / list.length;
  const before = avg(values.slice(0, half));
  const after = avg(values.slice(half));
  if (after > before * 1.25) return "getting slower";
  if (after < before * 0.8) return "getting faster";
  return "steady";
}

function Sparkline({ values }: { values: number[] }) {
  const width = 120;
  const height = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => [
    Math.round(index * step * 10) / 10,
    Math.round((height - 3 - ((value - min) / span) * (height - 6)) * 10) / 10,
  ]);
  const line = points
    .map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`)
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return (
    <svg
      role="img"
      aria-label={`Response time trend: ${trendWord(values)}`}
      viewBox={`0 0 ${width} ${height}`}
      className="hf-stat-spark h-7 w-28"
      preserveAspectRatio="none"
    >
      <path
        d={line}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path d={area} />
    </svg>
  );
}

function UptimeStrip({ history }: { history: CapabilityState[] }) {
  const slots: (CapabilityState | null)[] = [
    ...Array.from(
      { length: Math.max(0, MAX_SAMPLES - history.length) },
      () => null
    ),
    ...history.slice(-MAX_SAMPLES),
  ];
  const counts = { ok: 0, degraded: 0, down: 0 };
  for (const state of history) {
    if (state === "ok" || state === "degraded" || state === "down") {
      counts[state] += 1;
    }
  }
  const label = history.length
    ? `Last ${history.length} checks: ${counts.ok} operational, ${counts.degraded} degraded, ${counts.down} unavailable`
    : "No checks recorded yet";
  return (
    <div role="img" aria-label={label} className="hf-stat-strip">
      {slots.map((state, index) => (
        <span key={index} data-s={state ?? undefined} />
      ))}
    </div>
  );
}

function CapabilityCard({
  capability,
  index,
  history,
  latencies,
}: {
  capability: Capability;
  index: number;
  history: CapabilityState[];
  latencies: number[];
}) {
  const Icon = CAPABILITY_ICONS[capability.key];
  return (
    <li
      className="hf-rise hf-stat-card"
      data-state={capability.state}
      style={{ animationDelay: `${0.1 + index * 0.07}s` }}
    >
      <div className="flex items-start gap-3">
        <span className="hf-stat-icon" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <h3 className="font-extrabold">{capability.name}</h3>
            <span className="hf-stat-pill">
              <span className="hf-stat-dot" aria-hidden="true" />
              {stateLabel(capability.state)}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            {capability.text}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <span>Recent checks</span>
          {latencies.length >= 2 && <span>Response time</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <UptimeStrip history={history} />
          </div>
          {latencies.length >= 2 && <Sparkline values={latencies} />}
        </div>
      </div>
    </li>
  );
}

function CountdownRing({ secondsLeft }: { secondsLeft: number | null }) {
  const size = 40;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio =
    secondsLeft === null ? 0 : Math.min(1, secondsLeft / (REFRESH_MS / 1000));
  return (
    <span
      className="hf-stat-countdown relative inline-grid place-items-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke="var(--muted)"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="var(--primary)"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-extrabold">
        {secondsLeft === null ? "–" : `${secondsLeft}s`}
      </span>
    </span>
  );
}

export function StatusWidget() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [nextCheckAt, setNextCheckAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const nextCheckRef = useRef(0);
  const inFlightRef = useRef(false);

  const check = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    let nextStatus: StatusResponse | null = null;
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error("status");
      nextStatus = (await res.json()) as StatusResponse;
      setStatus(nextStatus);
      setRequestFailed(false);
    } catch {
      nextStatus = null;
      setStatus(null);
      setRequestFailed(true);
    } finally {
      const checkedAt = Date.now();
      const overall: Sample["overall"] =
        !nextStatus || !nextStatus.ok
          ? "down"
          : nextStatus.degraded
            ? "degraded"
            : "ok";
      const sample = sampleFrom(
        capabilityRows(nextStatus?.checks),
        overall,
        checkedAt
      );
      setSamples((prev) => [...prev, sample].slice(-MAX_SAMPLES));
      setLastChecked(new Date(checkedAt).toISOString());
      nextCheckRef.current = checkedAt + REFRESH_MS;
      setNextCheckAt(checkedAt + REFRESH_MS);
      setNow(checkedAt);
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = readSamples();
      if (stored.length) {
        setSamples((prev) => [...stored, ...prev].slice(-MAX_SAMPLES));
      }
    });
  }, []);

  useEffect(() => {
    if (samples.length) writeSamples(samples);
  }, [samples]);

  useEffect(() => {
    const initial = window.setTimeout(() => void check(), 0);
    const tick = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (
        document.visibilityState === "visible" &&
        nextCheckRef.current > 0 &&
        current >= nextCheckRef.current
      ) {
        void check();
      }
    }, 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(tick);
    };
  }, [check]);

  const overallDown = requestFailed || Boolean(status && !status.ok);
  const overallDegraded = Boolean(status?.degraded);
  const overallLabel = loading
    ? "Checking…"
    : overallDown
      ? "Service disruption"
      : overallDegraded
        ? "Some services degraded"
        : "All systems operational";
  const heroState: CapabilityState =
    loading && !lastChecked
      ? "checking"
      : overallDown
        ? "down"
        : overallDegraded
          ? "degraded"
          : "ok";
  const heroCopy =
    heroState === "checking"
      ? "Running a live check of every service…"
      : heroState === "down"
        ? "Something isn't working right now. The affected services are highlighted below, with what you can do instead."
        : heroState === "degraded"
          ? "Most things are working. Some services are slower or more limited than usual — details below."
          : "Sign-in, guides, the assistant, tickets and email are all working normally.";
  const HeroIcon =
    heroState === "down" ? X : heroState === "degraded" ? AlertTriangle : Check;
  const rows = capabilityRows(status?.checks);
  const uptime = uptimePercent(samples);
  const secondsLeft =
    nextCheckAt && now
      ? Math.max(0, Math.ceil((nextCheckAt - now) / 1000))
      : null;
  const anyTrouble = overallDown || overallDegraded;

  return (
    <div className="mt-8">
      <section
        className="hf-stat-hero hf-rise rounded-[28px] border border-border p-5 shadow-sm sm:p-7"
        data-state={heroState}
        aria-labelledby="hf-stat-headline"
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <span
            className="hf-stat-orb"
            data-state={heroState}
            aria-hidden="true"
          >
            <span className="hf-stat-orb-core">
              {heroState === "checking" ? (
                <RefreshCw className="hf-stat-spin h-9 w-9" />
              ) : (
                <HeroIcon className="h-10 w-10" />
              )}
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="hf-stat-headline"
              className="text-2xl font-extrabold tracking-tight sm:text-3xl"
            >
              {overallLabel}
            </h2>
            <p className="mt-1.5 max-w-xl text-sm font-semibold text-muted-foreground">
              {heroCopy}
            </p>
            <p className="mt-3 text-xs font-semibold text-muted-foreground">
              {lastChecked
                ? `Last checked ${new Date(lastChecked).toLocaleTimeString()}`
                : "Waiting for first check"}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            <span
              className="flex items-center gap-2 text-xs font-bold text-muted-foreground"
              title="Time until the next automatic check"
            >
              <CountdownRing secondsLeft={loading ? null : secondsLeft} />
              <span className="hidden sm:inline">Next check</span>
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void check()}
              disabled={loading}
              aria-label="Refresh system status"
              aria-busy={loading}
            >
              <RefreshCw
                className={cn("h-4 w-4", loading && "hf-stat-spin")}
                aria-hidden
              />
              <span className="sr-only">Refresh</span>
            </Button>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="hf-stat-tile">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Uptime this session
            </dt>
            <dd className="mt-1 text-xl font-extrabold sm:text-2xl">
              {uptime === null ? "—" : `${uptime}%`}
            </dd>
          </div>
          <div className="hf-stat-tile">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Fully working
            </dt>
            <dd className="mt-1 text-xl font-extrabold sm:text-2xl">
              {rows.some((row) => row.state !== "checking")
                ? `${rows.filter((row) => row.state === "ok").length}/${rows.length}`
                : "—"}
            </dd>
          </div>
          <div className="hf-stat-tile">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Checks run
            </dt>
            <dd className="mt-1 text-xl font-extrabold sm:text-2xl">
              {samples.length}
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-8 flex items-end justify-between gap-3">
        <h2 className="text-xl font-extrabold">Services</h2>
        <p className="text-xs font-semibold text-muted-foreground">
          Each bar is one check while this page is open
        </p>
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map((capability, index) => (
          <CapabilityCard
            key={capability.name}
            capability={capability}
            index={index}
            history={samples.map(
              (sample) => sample.states?.[capability.key] ?? "checking"
            )}
            latencies={samples
              .map((sample) => sample.ms?.[capability.key])
              .filter((ms): ms is number => typeof ms === "number" && ms >= 0)}
          />
        ))}
      </ul>

      <section
        className={cn(
          "hf-rise mt-8 rounded-[28px] border p-5 sm:p-6",
          anyTrouble
            ? "border-status-warning/40 bg-status-warning/10"
            : "border-border bg-card"
        )}
        style={{ animationDelay: "0.5s" }}
        aria-labelledby="hf-stat-help"
      >
        <h2 id="hf-stat-help" className="text-lg font-extrabold">
          What to do if something is down
        </h2>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {anyTrouble
            ? "You can still get help while we sort this out."
            : "Having trouble anyway? These still work, whatever the status."}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link href="/assistant" className="hf-stat-action">
            <span className="hf-stat-icon" aria-hidden="true">
              <Bot className="h-5 w-5" />
            </span>
            <span>
              Ask the assistant
              <span className="block text-xs font-semibold text-muted-foreground">
                Quick answers, any time
              </span>
            </span>
          </Link>
          <Link href="/assistant?intent=human" className="hf-stat-action">
            <span className="hf-stat-icon" aria-hidden="true">
              <Headset className="h-5 w-5" />
            </span>
            <span>
              Contact support
              <span className="block text-xs font-semibold text-muted-foreground">
                Reach a person on the IT team
              </span>
            </span>
          </Link>
          <Link href="/browse" className="hf-stat-action">
            <span className="hf-stat-icon" aria-hidden="true">
              <BookOpen className="h-5 w-5" />
            </span>
            <span>
              Browse guides
              <span className="block text-xs font-semibold text-muted-foreground">
                Step-by-step fixes you can do yourself
              </span>
            </span>
          </Link>
        </div>
      </section>

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
