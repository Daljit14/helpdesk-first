"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CollapsibleSection } from "./collapsible-section";
import type {
  DbOverview,
  DbSection,
  LiveEvent,
} from "@/lib/admin/database-overview";

const LIVE_STORAGE_KEY = "hf-admin-live";
const POLL_INTERVAL = 3000;
const BACKOFF_INTERVAL = 10000;
const SECTION_REFRESH_INTERVAL = 15000;

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

function cellValue(
  section: DbSection,
  column: string,
  value: string | number | null
) {
  if (value === null || value === "") return "—";
  const text = isDateColumn(column)
    ? relativeDate(String(value))
    : String(value);
  const content =
    section.key === "tickets" && column === "id" ? (
      <Link
        href={`/admin/tickets/${String(value)}`}
        className="underline decoration-muted-foreground/50 underline-offset-4"
      >
        {text}
      </Link>
    ) : (
      text
    );
  return isDateColumn(column) ? (
    <span title={String(value)}>{content}</span>
  ) : (
    content
  );
}

function SectionTable({ section }: { section: DbSection }) {
  if (section.error) {
    return <p className="text-sm text-destructive">{section.error}</p>;
  }
  if (section.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No rows yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            {section.columns.map((column) => (
              <th
                key={column}
                className="whitespace-nowrap px-3 py-2 font-medium"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, index) => (
            <tr
              key={`${section.key}-${String(row.id ?? index)}`}
              className="border-b border-border last:border-0"
            >
              {section.columns.map((column) => (
                <td key={column} className="whitespace-nowrap px-3 py-2">
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
  const [updatedAt, setUpdatedAt] = useState(initial.generatedAt);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [visibilityTick, setVisibilityTick] = useState(0);
  const cursorRef = useRef(initial.generatedAt);
  const failuresRef = useRef(0);
  const lastSectionRefreshRef = useRef(0);

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

  const refreshOverview = useCallback(async () => {
    const response = await fetch("/api/admin/database", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Unable to refresh database overview.");
    const body = (await response.json()) as { overview: DbOverview };
    setOverview(body.overview);
    setUpdatedAt(body.overview.generatedAt);
    cursorRef.current = body.overview.generatedAt;
  }, []);

  const refreshSectionsIfNeeded = useCallback(
    async (incoming: LiveEvent[]) => {
      if (!incoming.length) return;
      const now = Date.now();
      if (now - lastSectionRefreshRef.current < SECTION_REFRESH_INTERVAL)
        return;
      lastSectionRefreshRef.current = now;
      await refreshOverview();
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

  const sortedSections = useMemo(() => overview.sections, [overview.sections]);

  function scrollToSection(key: string) {
    const element = document.getElementById(`database-section-${key}`);
    if (!element) return;
    const details = element.querySelector("details");
    if (details && !details.open) {
      details
        .querySelector("summary")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="flex flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Platform administration
            </p>
            <h1 className="mt-1 text-3xl font-bold">Database</h1>
            <p className="mt-2 text-muted-foreground">
              Everything stored for this workspace, in one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={live}
              onClick={() => setLiveState(!live)}
              className="glass-pill inline-flex items-center gap-2 px-3 py-2 text-sm"
            >
              <span
                className={`h-2 w-2 rounded-full bg-primary ${
                  live ? "hf-halo" : ""
                }`}
                aria-hidden
              />
              {live ? "Live · on" : "Live"}
            </button>
            <button
              type="button"
              aria-label="Refresh database"
              onClick={() => void refreshOverview()}
              className="glass-pill inline-flex items-center gap-2 px-3 py-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Refresh
            </button>
            <span className="text-xs text-muted-foreground">
              Updated {formatTime(updatedAt)}
            </span>
          </div>
        </header>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sortedSections.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => scrollToSection(section.key)}
              className="glass text-left transition hover:-translate-y-0.5"
            >
              <span className="block p-4">
                <span className="block text-sm text-muted-foreground">
                  {section.label}
                </span>
                <span className="mt-1 block text-2xl font-semibold">
                  {formatCount(section.count)}
                </span>
              </span>
            </button>
          ))}
        </div>

        <section
          className="glass mt-6 p-5"
          aria-labelledby="database-live-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="database-live-heading" className="font-semibold">
                Live activity
              </h2>
              <p className="text-sm text-muted-foreground">
                New activity from the workspace appears here.
              </p>
            </div>
            {reconnecting && (
              <span className="text-xs text-muted-foreground">
                Reconnecting…
              </span>
            )}
          </div>
          {events.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">
              Turn on Live to watch signups, logins and tickets appear here in
              real time.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border" aria-live="polite">
              {events.map((event) => (
                <li
                  key={event.id}
                  className={`relative py-3 pl-3 ${
                    newIds.has(event.id)
                      ? "hf-pop border-l-2 border-primary"
                      : "border-l-2 border-transparent"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    {event.href ? (
                      <Link
                        href={event.href}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {event.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{event.title}</span>
                    )}
                    <time
                      dateTime={event.at}
                      title={event.at}
                      className="text-xs text-muted-foreground"
                    >
                      {relativeDate(event.at)}
                    </time>
                  </div>
                  {event.detail && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {event.detail}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-6 space-y-4">
          {sortedSections.map((section) => (
            <div
              key={section.key}
              id={`database-section-${section.key}`}
              className="scroll-mt-6"
            >
              <CollapsibleSection
                id={`database-${section.key}`}
                title={section.label}
                defaultOpen
                summary={
                  <span className="inline-flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {formatCount(section.count)}
                    </span>
                    {section.error && (
                      <span className="text-xs text-destructive">
                        {section.error}
                      </span>
                    )}
                  </span>
                }
              >
                <SectionTable section={section} />
              </CollapsibleSection>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
