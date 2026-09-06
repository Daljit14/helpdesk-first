"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  AdminFilters,
  AdminMetric,
  AdminOperationsTicket,
  OperationsData,
} from "@/lib/admin/operations-data";

type RefreshStatus = "idle" | "refreshing" | "error";

const ADMIN_OUTLINE_BUTTON =
  "border-slate-300 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-900";

const metricLabels: [keyof AdminMetric, string][] = [
  ["activeUsers", "Active users"],
  ["uniqueVisitorsToday", "Unique visitors today"],
  ["pageViewsToday", "Page views today"],
  ["totalTickets", "Total tickets"],
  ["openTickets", "Open tickets"],
  ["newTickets", "New tickets"],
  ["inProgressTickets", "In progress"],
  ["waitingTickets", "Waiting"],
  ["urgentOpenTickets", "Urgent open"],
  ["completedToday", "Completed today"],
  ["totalCompleted", "Total completed"],
  ["slaBreached", "SLA breached"],
  ["avgFirstResponseMinutes", "Avg first response (min)"],
  ["avgResolutionMinutes", "Avg resolution (min)"],
];

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return `${hours}h ${remaining}m`;
}

function metricTone(key: keyof AdminMetric) {
  if (["urgentOpenTickets", "slaBreached"].includes(key))
    return "border-red-200 bg-red-50";
  if (key === "waitingTickets") return "border-orange-200 bg-orange-50";
  if (["completedToday", "totalCompleted"].includes(key))
    return "border-emerald-200 bg-emerald-50";
  if (key === "newTickets") return "border-blue-200 bg-blue-50";
  return "border-slate-200 bg-white";
}

function makeQuery(filters: AdminFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

function TicketTable({ tickets }: { tickets: AdminOperationsTicket[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="bg-slate-100">
          <tr>
            {[
              "Ticket #",
              "Created",
              "Issue title",
              "Category",
              "Platform",
              "Priority",
              "Status",
              "Resolved by",
              "Agent",
              "SLA status",
              "Last updated",
            ].map((heading) => (
              <th key={heading} className="px-4 py-3 font-semibold">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.ticketUuid} className="border-t border-slate-200">
              <td className="px-4 py-3 font-mono">
                <Link
                  href={`/admin/tickets/${ticket.ticketUuid}`}
                  className="underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {ticket.ticketId}
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {new Date(ticket.createdAt).toLocaleString()}
              </td>
              <td className="px-4 py-3">{ticket.issueTitle}</td>
              <td className="px-4 py-3">{ticket.category}</td>
              <td className="px-4 py-3">{ticket.platform}</td>
              <td className="px-4 py-3">{ticket.priority}</td>
              <td className="px-4 py-3">{ticket.status}</td>
              <td className="px-4 py-3">{ticket.resolvedBy ?? "—"}</td>
              <td className="px-4 py-3">
                {ticket.assignedAgent || "Unassigned"}
              </td>
              <td className="px-4 py-3">
                <span className="rounded bg-slate-100 px-2 py-1">
                  {ticket.slaState}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3">
                {new Date(ticket.lastUpdatedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminDashboard({
  initialSnapshot,
  resolutionTrackingEnabled = false,
}: {
  initialSnapshot: OperationsData;
  resolutionTrackingEnabled?: boolean;
}) {
  const router = useRouter();
  const initialTime = Date.parse(initialSnapshot.generatedAt);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [filters, setFilters] = useState(initialSnapshot.filters);
  const [lastSuccessAt, setLastSuccessAt] = useState(initialTime);
  const [now, setNow] = useState(initialTime);
  const [status, setStatus] = useState<RefreshStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(
    async (nextFilters = filters) => {
      setStatus("refreshing");
      try {
        const response = await fetch(
          `/api/admin/operations?${makeQuery(nextFilters)}`,
          { cache: "no-store" }
        );
        if (response.status === 401 || response.status === 403) {
          router.push("/admin/login?next=/admin/operations");
          return;
        }
        if (!response.ok) throw new Error("Unable to refresh operations data.");
        setSnapshot((await response.json()) as OperationsData);
        setLastSuccessAt(Date.now());
        setError(null);
        setStatus("idle");
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : "Refresh failed."
        );
        setStatus("error");
      }
    },
    [filters, router]
  );

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    let interval: number | undefined;
    const start = () => {
      window.clearInterval(interval);
      if (document.visibilityState === "visible")
        interval = window.setInterval(() => void refreshRef.current(), 300_000);
    };
    const onVisibility = () => {
      window.clearInterval(interval);
      if (document.visibilityState === "visible") {
        if (Date.now() - lastSuccessAt > 30_000) void refreshRef.current();
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lastSuccessAt]);

  const age = now - lastSuccessAt;
  const freshness =
    status === "error" || age > 10 * 60_000
      ? "STALE"
      : age > 6 * 60_000
        ? "DELAYED"
        : "LIVE";
  const totalPages = Math.max(
    1,
    Math.ceil(snapshot.tickets.total / snapshot.tickets.pageSize)
  );
  const updateFilter = (key: keyof AdminFilters, value: string | number) => {
    const next = { ...filters, [key]: value, page: 1 };
    setFilters(next);
    router.replace(`/admin/operations?${makeQuery(next)}`, { scroll: false });
    void refresh(next);
  };
  const maxCategory = Math.max(
    1,
    ...snapshot.metrics.ticketsByCategory.map((item) => item.count)
  );
  const maxPlatform = Math.max(
    1,
    ...snapshot.metrics.ticketsByPlatform.map((item) => item.count)
  );
  const staleMessage = useMemo(
    () => (freshness === "STALE" ? "Data may be out of date." : null),
    [freshness]
  );

  return (
    <div className="bg-white text-slate-900">
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Operations</h1>
            <p className="mt-2 text-slate-600">
              Live support operations dashboard.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Organization: {snapshot.organizationName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={
                freshness === "LIVE"
                  ? "text-emerald-700"
                  : freshness === "DELAYED"
                    ? "text-orange-700"
                    : "text-red-700"
              }
            >
              {freshness === "LIVE" ? "✓ " : ""}
              {freshness}
            </span>
            <span className="text-sm text-slate-600">
              Last updated {formatTime(lastSuccessAt)}
            </span>
            <span className="text-sm text-slate-600">
              Next refresh {formatTime(lastSuccessAt + 300_000)}
            </span>
            <Button
              type="button"
              variant="outline"
              className={ADMIN_OUTLINE_BUTTON}
              onClick={() => void refresh()}
              disabled={status === "refreshing"}
              aria-busy={status === "refreshing"}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh now
            </Button>
          </div>
        </div>
        {error && (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-md bg-red-50 p-3 text-red-800"
          >
            {error}
          </p>
        )}
        {staleMessage && (
          <p className="rounded-md bg-orange-50 p-3 text-orange-800">
            {staleMessage}
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {metricLabels.map(([key, label]) => (
            <div
              key={key}
              className={`rounded-xl border p-4 ${metricTone(key)}`}
            >
              <p className="text-sm text-slate-600">{label}</p>
              <p className="mt-2 text-3xl font-bold">
                {snapshot.metrics[key] as number}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {[
            [
              "Tickets by category",
              snapshot.metrics.ticketsByCategory,
              maxCategory,
            ],
            [
              "Tickets by platform",
              snapshot.metrics.ticketsByPlatform,
              maxPlatform,
            ],
          ].map(([title, items, max]) => (
            <section
              key={title as string}
              className="rounded-xl border border-slate-200 p-5"
            >
              <h2 className="font-semibold">{title as string}</h2>
              <div className="mt-4 space-y-3">
                {(items as { key: string; count: number }[]).map((item) => (
                  <div key={item.key}>
                    <div className="flex justify-between text-sm">
                      <span>{item.key}</span>
                      <span>{item.count}</span>
                    </div>
                    <div
                      className="mt-1 h-2 rounded bg-blue-600"
                      style={{
                        width: `${(item.count / (max as number)) * 100}%`,
                      }}
                      aria-label={`${item.key}: ${item.count}`}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="overflow-x-auto rounded-xl border border-slate-200">
          <h2 className="border-b border-slate-200 p-5 font-semibold">
            Agent workload
          </h2>
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                {[
                  "Agent",
                  "Open",
                  "Urgent",
                  "Breached",
                  "Waiting",
                  "Resolved today",
                ].map((heading) => (
                  <th key={heading} className="px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.metrics.agentWorkload.map((row) => (
                <tr key={row.agent} className="border-t border-slate-200">
                  <td className="px-4 py-3">{row.agent}</td>
                  <td className="px-4 py-3">{row.open}</td>
                  <td className="px-4 py-3">{row.urgent}</td>
                  <td className="px-4 py-3">{row.breached}</td>
                  <td className="px-4 py-3">{row.waiting}</td>
                  <td className="px-4 py-3">{row.resolvedToday}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {resolutionTrackingEnabled && snapshot.resolution && (
          <section className="space-y-5 rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold">Resolution tracking</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
              {[
                [
                  "Total tickets",
                  snapshot.resolution.totalTickets,
                  "border-slate-200 bg-white",
                ],
                [
                  "Solved by AI",
                  snapshot.resolution.aiSolved,
                  "border-emerald-200 bg-emerald-50",
                ],
                [
                  "Solved by agents",
                  snapshot.resolution.agentSolved,
                  "border-blue-200 bg-blue-50",
                ],
                [
                  "Escalated",
                  snapshot.resolution.escalated,
                  "border-orange-200 bg-orange-50",
                ],
                [
                  "Open",
                  snapshot.resolution.openTickets,
                  "border-blue-200 bg-blue-50",
                ],
                [
                  "AI resolution rate",
                  `${snapshot.resolution.aiResolutionRate}%`,
                  "border-emerald-200 bg-emerald-50",
                ],
                [
                  "Avg resolution time",
                  formatDuration(snapshot.resolution.avgResolutionMinutes),
                  "border-slate-200 bg-white",
                ],
              ].map(([label, value, tone]) => (
                <div
                  key={String(label)}
                  className={`rounded-xl border p-4 ${tone}`}
                >
                  <p className="text-sm text-slate-600">{label}</p>
                  <p className="mt-2 text-2xl font-bold">{value}</p>
                  {label === "AI resolution rate" && (
                    <p className="mt-1 text-xs text-slate-500">
                      of {snapshot.resolution?.aiAttempted ?? 0} AI-attempted
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div
              role="img"
              aria-label="Fourteen day resolution tracking chart"
              className="space-y-2"
            >
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span>
                  <i className="mr-1 inline-block h-2 w-2 bg-emerald-500" />
                  AI solved
                </span>
                <span>
                  <i className="mr-1 inline-block h-2 w-2 bg-blue-500" />
                  Agent solved
                </span>
                <span>
                  <i className="mr-1 inline-block h-2 w-2 bg-orange-500" />
                  Escalated
                </span>
              </div>
              {snapshot.resolution.daily.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No resolution activity.
                </p>
              ) : (
                snapshot.resolution.daily.map((point) => {
                  const total =
                    point.aiSolved + point.agentSolved + point.escalated;
                  const width = Math.max(total, 1);
                  return (
                    <div key={point.day} className="flex items-center gap-3">
                      <span className="w-24 text-xs text-slate-600">
                        {point.day}
                      </span>
                      <div className="flex h-5 flex-1 overflow-hidden rounded bg-slate-100">
                        <div
                          className="bg-emerald-500"
                          style={{
                            width: `${(point.aiSolved / width) * 100}%`,
                          }}
                        />
                        <div
                          className="bg-blue-500"
                          style={{
                            width: `${(point.agentSolved / width) * 100}%`,
                          }}
                        />
                        <div
                          className="bg-orange-500"
                          style={{
                            width: `${(point.escalated / width) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs">{total}</span>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        <section id="tickets" className="rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 p-5">
            <h2 className="font-semibold">Tickets</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <select
                aria-label="Status"
                value={filters.status ?? ""}
                onChange={(event) => updateFilter("status", event.target.value)}
                className="h-9 rounded-md border border-slate-300 px-3"
              >
                <option value="">All statuses</option>
                <option>New</option>
                <option>In Progress</option>
                <option>Waiting</option>
                <option>Resolved</option>
                <option>Closed</option>
              </select>
              {snapshot.resolution && (
                <select
                  aria-label="Resolution"
                  value={filters.resolutionSource ?? ""}
                  onChange={(event) =>
                    updateFilter("resolutionSource", event.target.value)
                  }
                  className="h-9 rounded-md border border-slate-300 px-3"
                >
                  <option value="">All resolutions</option>
                  <option value="ai">Solved by AI</option>
                  <option value="agent">Solved by agent</option>
                  <option value="self_service">Self-service</option>
                  <option value="unresolved">Unresolved</option>
                </select>
              )}
              <select
                aria-label="Priority"
                value={filters.priority ?? ""}
                onChange={(event) =>
                  updateFilter("priority", event.target.value)
                }
                className="h-9 rounded-md border border-slate-300 px-3"
              >
                <option value="">All priorities</option>
                <option>Low</option>
                <option>Normal</option>
                <option>High</option>
                <option>Urgent</option>
              </select>
              <Input
                aria-label="Category"
                value={filters.category ?? ""}
                onChange={(event) =>
                  updateFilter("category", event.target.value)
                }
                placeholder="Category"
              />
              <select
                aria-label="Platform"
                value={filters.platform ?? ""}
                onChange={(event) =>
                  updateFilter("platform", event.target.value)
                }
                className="h-9 rounded-md border border-slate-300 px-3"
              >
                <option value="">All platforms</option>
                <option>Windows</option>
                <option>macOS</option>
                <option>Linux</option>
                <option>Android</option>
                <option>iOS</option>
                <option>Other</option>
              </select>
              <Input
                aria-label="Agent"
                value={filters.agent ?? ""}
                onChange={(event) => updateFilter("agent", event.target.value)}
                placeholder="Agent"
              />
              <Input
                aria-label="Created from"
                type="date"
                value={filters.from.slice(0, 10)}
                onChange={(event) =>
                  updateFilter(
                    "from",
                    new Date(
                      `${event.target.value}T00:00:00.000Z`
                    ).toISOString()
                  )
                }
              />
              <Input
                aria-label="Created to"
                type="date"
                value={filters.to?.slice(0, 10) ?? ""}
                onChange={(event) =>
                  updateFilter(
                    "to",
                    new Date(
                      `${event.target.value}T23:59:59.999Z`
                    ).toISOString()
                  )
                }
              />
              <select
                aria-label="SLA"
                value={filters.sla ?? ""}
                onChange={(event) => updateFilter("sla", event.target.value)}
                className="h-9 rounded-md border border-slate-300 px-3"
              >
                <option value="">All SLA states</option>
                <option value="on_track">On track</option>
                <option value="due_soon">Due &lt;1h</option>
                <option value="breached">Breached</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
          {status === "refreshing" && (
            <div className="p-5 text-sm text-slate-600">
              Loading operations data…
            </div>
          )}
          {snapshot.tickets.rows.length === 0 && status !== "refreshing" ? (
            <p className="p-8 text-center text-slate-600">
              No tickets match these filters
            </p>
          ) : (
            <TicketTable tickets={snapshot.tickets.rows} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
            <span className="text-sm text-slate-600">
              Page {filters.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className={ADMIN_OUTLINE_BUTTON}
                disabled={filters.page <= 1}
                onClick={() => updateFilter("page", filters.page - 1)}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                className={ADMIN_OUTLINE_BUTTON}
                disabled={filters.page >= totalPages}
                onClick={() => updateFilter("page", filters.page + 1)}
              >
                Next
              </Button>
              <select
                aria-label="Page size"
                value={filters.pageSize}
                onChange={(event) =>
                  updateFilter("pageSize", Number(event.target.value))
                }
                className="h-9 rounded-md border border-slate-300 px-3"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </section>
        <p className="text-sm text-slate-600">
          Pseudonymous operations data only — no emails, messages, or
          attachments.
        </p>
      </div>
    </div>
  );
}
