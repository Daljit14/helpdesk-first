"use client";

import Link from "next/link";
import {
  BarChart3,
  Bell,
  Bot,
  Building2,
  Cpu,
  Database,
  FileClock,
  History,
  Laptop,
  LogIn,
  Paperclip,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Table2,
  Ticket,
  UserCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DbOverview,
  DbSection,
  LiveEvent,
} from "@/lib/admin/database-overview";
import { CountUp } from "@/components/admin/ops/visuals";
import { EmptyState, HeroChip } from "@/components/admin/ui/admin-kit";

const LIVE_STORAGE_KEY = "hf-admin-live";
const POLL_INTERVAL = 3000;
const BACKOFF_INTERVAL = 10000;
const SECTION_REFRESH_INTERVAL = 15000;

const SECTION_ICON: Record<DbSection["key"], LucideIcon> = {
  users: UsersRound,
  organizations: Building2,
  members: UserCheck,
  tickets: Ticket,
  agent_sessions: Bot,
  resolution_runs: Sparkles,
  devices: Laptop,
  attachments: Paperclip,
  notifications: Bell,
  ai_calls: Cpu,
  audit: FileClock,
  ticket_events: History,
  analytics: BarChart3,
};

const EVENT_ICON: Record<LiveEvent["kind"], LucideIcon> = {
  signup: UserPlus,
  login: LogIn,
  ticket_created: Ticket,
  ticket_updated: RefreshCw,
  agent_session: Bot,
  run: Sparkles,
  device: Laptop,
  attachment: Paperclip,
  notification: Bell,
  ai_call: Cpu,
  audit: FileClock,
  member_joined: UserCheck,
};

/** One colour per table, reused by the storage bar, tiles and explorer. */
const PALETTE = [
  "#7c5cff",
  "#22b8cf",
  "#ffa928",
  "#f472b6",
  "#34d399",
  "#60a5fa",
  "#f87171",
  "#a3e635",
  "#c084fc",
  "#fb923c",
  "#2dd4bf",
  "#facc15",
  "#e879f9",
];

function formatCount(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat().format(value);
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function relativeDate(value: string) {
  const difference = Date.now() - Date.parse(value);
  const seconds = Math.max(0, Math.round(difference / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function isDateColumn(column: string) {
  return column.endsWith("_at") || column === "created_at";
}

function columnLabel(column: string) {
  const label = column.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function toneFor(value: string) {
  const v = value.toLowerCase();
  if (
    /(resolved|closed|sent|success|succeeded|completed|active|online|verified|ok)/.test(
      v
    )
  )
    return "bg-status-success/15 text-status-success";
  if (/(fail|dead|error|breach|urgent|revoked|blocked)/.test(v))
    return "bg-status-danger/15 text-status-danger";
  if (/(pending|waiting|queued|high|needs|progress|running)/.test(v))
    return "bg-status-warning/15 text-status-warning";
  return "bg-secondary text-secondary-foreground";
}

const PILL_COLUMNS = new Set([
  "status",
  "role",
  "priority",
  "provider",
  "platform",
  "joined_via",
  "actor_role",
  "event_type",
  "kind",
  "channel",
]);

function cellValue(
  section: DbSection,
  column: string,
  value: string | number | null
) {
  if (value === null || value === "")
    return <span className="text-muted-foreground">—</span>;
  const raw = String(value);
  if (isDateColumn(column)) {
    return (
      <time dateTime={raw} title={raw} className="text-muted-foreground">
        {relativeDate(raw)}
      </time>
    );
  }
  if (section.key === "tickets" && column === "id") {
    return (
      <Link
        href={`/admin/tickets/${raw}`}
        className="font-mono text-xs font-bold text-primary underline-offset-4 hover:underline"
      >
        {raw}
      </Link>
    );
  }
  if (PILL_COLUMNS.has(column)) {
    return (
      <span
        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold ${toneFor(raw)}`}
      >
        {raw}
      </span>
    );
  }
  if (column === "id" || column.endsWith("_id")) {
    return (
      <span className="font-mono text-xs text-muted-foreground" title={raw}>
        {raw.length > 13 ? `${raw.slice(0, 8)}…${raw.slice(-4)}` : raw}
      </span>
    );
  }
  if (column === "email") {
    return <span className="font-semibold">{raw}</span>;
  }
  return raw;
}

function SectionTable({
  section,
  filter,
}: {
  section: DbSection;
  filter: string;
}) {
  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return section.rows;
    return section.rows.filter((row) =>
      section.columns.some((column) =>
        String(row[column] ?? "")
          .toLowerCase()
          .includes(needle)
      )
    );
  }, [filter, section]);

  if (section.error) {
    return (
      <p className="m-5 rounded-2xl border border-status-danger/30 bg-status-danger/10 p-3 text-sm font-bold text-status-danger">
        {section.error}
      </p>
    );
  }
  if (section.rows.length === 0) {
    return (
      <EmptyState
        icon={SECTION_ICON[section.key] ?? Table2}
        title="No rows yet"
        body="New records will show up here as soon as they are created."
      />
    );
  }
  if (rows.length === 0) {
    return (
      <p className="p-8 text-center text-sm font-semibold text-muted-foreground">
        No rows match “{filter}”.
      </p>
    );
  }
  return (
    <div className="max-h-[560px] overflow-auto">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            {section.columns.map((column) => (
              <th key={column} className="whitespace-nowrap bg-card px-4 py-3">
                {columnLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={`${section.key}-${String(row.id ?? index)}`}
              className="border-t border-border"
            >
              {section.columns.map((column) => (
                <td key={column} className="whitespace-nowrap px-4 py-2.5">
                  {cellValue(section, column, row[column] ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DatabaseOverview({ initial }: { initial: DbOverview }) {
  const [overview, setOverview] = useState(initial);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [live, setLive] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(initial.generatedAt);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [visibilityTick, setVisibilityTick] = useState(0);
  const [selected, setSelected] = useState<DbSection["key"] | null>(
    initial.sections[0]?.key ?? null
  );
  const [filter, setFilter] = useState("");
  const cursorRef = useRef(initial.generatedAt);
  const failuresRef = useRef(0);
  const lastSectionRefreshRef = useRef(0);
  const explorerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        setLive(window.localStorage.getItem(LIVE_STORAGE_KEY) === "on");
      } catch {
        setLive(false);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setVisibilityTick((value) => value + 1);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const refreshOverview = useCallback(async (advanceCursor = true) => {
    const response = await fetch("/api/admin/database", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Unable to refresh database overview.");
    const body = (await response.json()) as { overview: DbOverview };
    setOverview(body.overview);
    setUpdatedAt(body.overview.generatedAt);
    if (advanceCursor) cursorRef.current = body.overview.generatedAt;
  }, []);

  const refreshSectionsIfNeeded = useCallback(
    async (incoming: LiveEvent[]) => {
      if (!incoming.length) return;
      const now = Date.now();
      if (now - lastSectionRefreshRef.current < SECTION_REFRESH_INTERVAL)
        return;
      lastSectionRefreshRef.current = now;
      await refreshOverview(false);
    },
    [refreshOverview]
  );

  useEffect(() => {
    if (!live || document.visibilityState !== "visible") return;
    let cancelled = false;
    let timeout: number | undefined;

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/admin/database?since=${encodeURIComponent(cursorRef.current)}`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("Live activity request failed.");
        const body = (await response.json()) as {
          events: LiveEvent[];
          cursor: string;
        };
        if (cancelled) return;
        failuresRef.current = 0;
        setReconnecting(false);
        cursorRef.current = body.cursor;
        if (body.events.length) {
          setEvents((current) => {
            const merged = new Map(
              [...body.events, ...current].map((event) => [event.id, event])
            );
            return [...merged.values()]
              .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
              .slice(0, 100);
          });
          const incomingIds = body.events.map((event) => event.id);
          setNewIds((current) => new Set([...current, ...incomingIds]));
          window.setTimeout(() => {
            setNewIds((current) => {
              const next = new Set(current);
              incomingIds.forEach((id) => next.delete(id));
              return next;
            });
          }, 5000);
          await refreshSectionsIfNeeded(body.events);
        }
      } catch {
        if (cancelled) return;
        failuresRef.current += 1;
        setReconnecting(true);
      }
      if (!cancelled) {
        const delay =
          failuresRef.current >= 3 ? BACKOFF_INTERVAL : POLL_INTERVAL;
        timeout = window.setTimeout(poll, delay);
      }
    };

    timeout = window.setTimeout(poll, POLL_INTERVAL);
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [live, refreshSectionsIfNeeded, visibilityTick]);

  const setLiveState = (next: boolean) => {
    setLive(next);
    try {
      window.localStorage.setItem(LIVE_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Storage is optional.
    }
  };

  const manualRefresh = () => {
    setRefreshing(true);
    refreshOverview(!live)
      .catch(() => setReconnecting(true))
      .finally(() => setRefreshing(false));
  };

  const sections = overview.sections;
  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    sections.forEach((section, index) =>
      map.set(section.key, PALETTE[index % PALETTE.length])
    );
    return map;
  }, [sections]);
  const totalRecords = sections.reduce(
    (sum, section) => sum + (section.count ?? 0),
    0
  );
  const largest = sections.reduce<DbSection | null>(
    (best, section) =>
      (section.count ?? 0) > (best?.count ?? -1) ? section : best,
    null
  );
  const maxCount = Math.max(1, ...sections.map((s) => s.count ?? 0));
  const errors = sections.filter((section) => section.error).length;
  const current =
    sections.find((section) => section.key === selected) ?? sections[0];

  const openTable = (key: DbSection["key"]) => {
    setSelected(key);
    setFilter("");
    explorerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="adm-page mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* ---------- Hero ---------- */}
      <section className="hf-adm-hero hf-adm-hero--midnight hf-rise relative overflow-hidden rounded-[28px] px-5 py-6 shadow-[0_24px_50px_-28px_var(--primary)] sm:px-7">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.22),transparent)]"
        />
        {/* Decorative data columns */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 gap-3 opacity-40 md:flex"
        >
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="relative h-full flex-1 overflow-hidden" />
          ))}
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4">
            <span
              aria-hidden
              className="relative hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur sm:flex"
            >
              <Database className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white/80">
                Platform administration
              </p>
              <h1 className="mt-0.5 text-3xl font-extrabold tracking-tight sm:text-[34px]">
                Database
              </h1>
              <p className="mt-1.5 max-w-2xl text-[15px] font-semibold text-white/90">
                Everything stored for this workspace, in one place.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={live}
              onClick={() => setLiveState(!live)}
              className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-extrabold transition-colors ${
                live
                  ? "bg-white text-[#3b2a8f] shadow-sm"
                  : "border border-white/35 bg-white/15 text-white hover:bg-white/25"
              }`}
            >
              <span className="relative h-2.5 w-2.5" aria-hidden>
                {live && (
                  <span className="hf-ping absolute inset-0 rounded-full bg-[#10b981]" />
                )}
                <span
                  className={`absolute inset-0 rounded-full ${live ? "bg-[#10b981]" : "bg-white/70"}`}
                />
              </span>
              {live ? "Live · on" : "Live"}
            </button>
            <button
              type="button"
              aria-label="Refresh database"
              onClick={manualRefresh}
              disabled={refreshing}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/35 bg-white/15 px-3.5 text-sm font-extrabold text-white backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-70"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                aria-hidden
              />
              Refresh
            </button>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-2">
          <HeroChip label="Tables" value={sections.length} />
          <HeroChip label="Records" value={formatCount(totalRecords)} />
          {largest && <HeroChip label="Largest" value={largest.label} />}
          <HeroChip
            label="Updated"
            value={formatTime(updatedAt)}
            pulse={live}
          />
          {errors > 0 && <HeroChip label="Unavailable" value={errors} />}
        </div>
      </section>

      {/* ---------- Storage map ---------- */}
      <section
        aria-labelledby="db-storage-heading"
        className="glass hf-rise p-5 sm:p-6"
        style={{ animationDelay: "0.05s" }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="db-storage-heading" className="text-lg font-extrabold">
            Where your data lives
          </h2>
          <span className="text-xs font-semibold text-muted-foreground">
            Share of all records · click a table to open it
          </span>
        </div>
        <div
          role="img"
          aria-label={`Records by table: ${sections
            .map((s) => `${s.label} ${formatCount(s.count)}`)
            .join(", ")}`}
          className="mt-4 flex h-5 overflow-hidden rounded-full bg-muted"
        >
          {sections.map((section, index) =>
            section.count ? (
              <span
                key={section.key}
                className="hf-adm-grow h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(section.count / Math.max(1, totalRecords)) * 100}%`,
                  minWidth: 4,
                  background: colorOf.get(section.key),
                  animationDelay: `${0.2 + index * 0.05}s`,
                }}
              />
            ) : null
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {sections.map((section, index) => {
            const Icon = SECTION_ICON[section.key] ?? Table2;
            const color = colorOf.get(section.key) ?? PALETTE[0];
            const active = current?.key === section.key;
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => openTable(section.key)}
                aria-pressed={active}
                className={`hf-adm-card hf-rise group flex flex-col gap-2 rounded-2xl border p-3.5 text-left ${
                  active
                    ? "border-primary/50 bg-secondary/50"
                    : "border-border bg-card"
                }`}
                style={{ animationDelay: `${0.1 + index * 0.03}s` }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white transition-transform group-hover:scale-110"
                    style={{ background: color }}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  {section.error && (
                    <span className="rounded-full bg-status-danger/15 px-2 text-[10px] font-extrabold text-status-danger">
                      error
                    </span>
                  )}
                </span>
                <span className="text-[12.5px] font-bold text-muted-foreground">
                  {section.label}
                </span>
                <span className="text-2xl font-extrabold tabular-nums">
                  {section.count === null ? (
                    "—"
                  ) : (
                    <CountUp value={section.count} />
                  )}
                </span>
                <span className="block h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="hf-adm-grow block h-full rounded-full"
                    style={{
                      width: `${((section.count ?? 0) / maxCount) * 100}%`,
                      background: color,
                      animationDelay: `${0.3 + index * 0.03}s`,
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ---------- Table explorer ---------- */}
        <section
          ref={explorerRef}
          aria-labelledby="db-explorer-heading"
          className="glass hf-rise scroll-mt-24 overflow-hidden"
          style={{ animationDelay: "0.1s" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              {current && (
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ background: colorOf.get(current.key) }}
                >
                  {(() => {
                    const Icon = SECTION_ICON[current.key] ?? Table2;
                    return <Icon className="h-4 w-4" aria-hidden />;
                  })()}
                </span>
              )}
              <div className="min-w-0">
                <h2 id="db-explorer-heading" className="text-lg font-extrabold">
                  {current?.label ?? "Tables"}
                </h2>
                <p className="text-xs font-semibold text-muted-foreground">
                  {current
                    ? `${formatCount(current.count)} total · showing the latest ${current.rows.length}`
                    : "Pick a table"}
                </p>
              </div>
            </div>
            <label className="relative w-full sm:w-64">
              <span className="sr-only">Filter rows</span>
              <Search
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter these rows…"
                className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm font-semibold outline-none transition-colors focus:border-primary/50"
              />
            </label>
          </div>
          <div
            role="tablist"
            aria-label="Tables"
            className="flex gap-1.5 overflow-x-auto border-b border-border px-4 py-2.5 sm:px-5"
          >
            {sections.map((section) => {
              const active = current?.key === section.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setSelected(section.key);
                    setFilter("");
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: colorOf.get(section.key) }}
                  />
                  {section.label}
                  <span className="opacity-80">
                    {formatCount(section.count)}
                  </span>
                </button>
              );
            })}
          </div>
          {current && (
            <div
              key={current.key}
              role="tabpanel"
              id={`database-section-${current.key}`}
              className="hf-swap"
            >
              <SectionTable section={current} filter={filter} />
            </div>
          )}
        </section>

        {/* ---------- Live activity ---------- */}
        <section
          className="glass hf-rise flex max-h-[760px] flex-col overflow-hidden"
          style={{ animationDelay: "0.15s" }}
          aria-labelledby="database-live-heading"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border p-4 sm:px-5">
            <div className="flex items-center gap-3">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                {live && (
                  <span aria-hidden className="absolute inset-0 rounded-xl" />
                )}
                <Radio className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h2
                  id="database-live-heading"
                  className="text-lg font-extrabold"
                >
                  Live activity
                </h2>
                <p className="text-xs font-semibold text-muted-foreground">
                  New activity from the workspace appears here.
                </p>
              </div>
            </div>
            {reconnecting ? (
              <span className="rounded-full bg-status-warning/15 px-2.5 py-1 text-xs font-extrabold text-status-warning">
                Reconnecting…
              </span>
            ) : live ? (
              <span className="rounded-full bg-status-success/15 px-2.5 py-1 text-xs font-extrabold text-status-success">
                Listening
              </span>
            ) : null}
          </div>
          {events.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
              <span
                aria-hidden
                className="relative flex h-24 w-24 items-center justify-center"
              >
                <span
                  className={`absolute inset-0 rounded-full border-2 border-primary/30 ${live ? "hf-ping" : ""}`}
                />
                <span
                  className={`absolute inset-3 rounded-full border-2 border-primary/40 ${live ? "hf-ping" : ""}`}
                  style={{ animationDelay: "0.5s" }}
                />
                <span className="hf-db-sweep absolute inset-0 rounded-full" />
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Radio className="h-5 w-5" />
                </span>
              </span>
              <p className="font-extrabold">
                {live ? "Waiting for new activity…" : "Live feed is paused"}
              </p>
              <p className="max-w-xs text-sm text-muted-foreground">
                {live
                  ? "Signups, logins and tickets will pop in here the moment they happen."
                  : "Turn on Live to watch signups, logins and tickets appear here in real time."}
              </p>
              {!live && (
                <button
                  type="button"
                  onClick={() => setLiveState(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px"
                >
                  <Radio className="h-4 w-4" aria-hidden />
                  Turn on live feed
                </button>
              )}
            </div>
          ) : (
            <ol
              className="relative flex-1 overflow-y-auto px-4 py-3 sm:px-5"
              aria-live="polite"
            >
              <span
                aria-hidden
                className="absolute bottom-3 left-[34px] top-3 w-px bg-border sm:left-[38px]"
              />
              {events.map((event) => {
                const Icon = EVENT_ICON[event.kind] ?? Sparkles;
                const fresh = newIds.has(event.id);
                return (
                  <li
                    key={event.id}
                    className={`relative flex gap-3 rounded-2xl py-2.5 pl-1 pr-2 ${fresh ? "hf-pop bg-secondary/50" : ""}`}
                  >
                    <span
                      className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-card ${
                        fresh
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        {event.href ? (
                          <Link
                            href={event.href}
                            className="text-sm font-bold underline-offset-4 hover:underline"
                          >
                            {event.title}
                          </Link>
                        ) : (
                          <span className="text-sm font-bold">
                            {event.title}
                          </span>
                        )}
                        <time
                          dateTime={event.at}
                          title={event.at}
                          className="text-[11px] font-semibold text-muted-foreground"
                        >
                          {relativeDate(event.at)}
                        </time>
                      </div>
                      {event.detail && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {event.detail}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
