"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Circle,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  AdminFilters,
  AdminMetric,
  AdminOperationsTicket,
  OperationsData,
} from "@/lib/admin/operations-data";
import { formatSlaCountdown } from "@/lib/tickets/sla";
import { updateOrganizationPolicy } from "@/app/actions/admin-workflow";
import type { OrganizationPolicy } from "@/lib/admin/policies";

type RefreshStatus = "idle" | "refreshing" | "error";

const ADMIN_OUTLINE_BUTTON = "glass-pill text-foreground hover:bg-muted";

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
    return "border-destructive/30 bg-destructive/10";
  if (key === "waitingTickets") return "border-amber-500/30 bg-amber-500/10";
  if (["completedToday", "totalCompleted"].includes(key))
    return "border-emerald-500/30 bg-emerald-500/10";
  if (key === "newTickets") return "border-primary/30 bg-primary/10";
  return "border-border bg-card/40";
}

function statusTone(status: string) {
  switch (status) {
    case "New":
    case "AI Reviewing":
    case "AI Resolving":
      return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200";
    case "Needs Human":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    case "In Progress":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-200";
    case "Waiting":
    case "Waiting for User":
      return "bg-violet-500/15 text-violet-800 dark:text-violet-200";
    case "Pending Verification":
      return "bg-teal-500/15 text-teal-800 dark:text-teal-200";
    case "Reopened":
      return "bg-orange-500/15 text-orange-800 dark:text-orange-200";
    case "Resolved":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    case "Closed":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusIcon(status: string) {
  if (status === "Resolved" || status === "Closed") return CheckCircle2;
  if (status === "Reopened") return RotateCcw;
  if (status === "Needs Human") return AlertTriangle;
  if (status === "Waiting" || status === "Waiting for User") return Clock;
  return Circle;
}

function statusToken(status: string) {
  if (status === "Resolved" || status === "Closed") {
    return "bg-[var(--status-success)]/20";
  }
  if (status === "Needs Human" || status === "Reopened") {
    return "bg-[var(--status-warning)]/20";
  }
  if (status === "Waiting" || status === "Waiting for User") {
    return "bg-[var(--status-info)]/20";
  }
  return "bg-muted";
}

function priorityTone(priority: string) {
  switch (priority) {
    case "Urgent":
      return "bg-red-500/15 text-red-800 dark:text-red-200";
    case "High":
      return "bg-orange-500/15 text-orange-800 dark:text-orange-200";
    case "Low":
      return "bg-slate-500/15 text-slate-700 dark:text-slate-200";
    case "Normal":
    default:
      return "bg-muted text-muted-foreground";
  }
}

function makeQuery(filters: AdminFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

function TicketTable({
  tickets,
  now,
  uiV2,
}: {
  tickets: AdminOperationsTicket[];
  now: number;
  uiV2: boolean;
}) {
  if (uiV2) {
    return (
      <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted">
              <tr>
                {["Ticket #", "Issue title", "Status", "Agent", "SLA"].map(
                  (heading) => (
                    <th key={heading} className="px-4 py-3 font-semibold">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => {
                const Icon = statusIcon(ticket.status);
                return (
                  <tr
                    key={ticket.ticketUuid}
                    className="border-t border-border"
                  >
                    <td className="px-4 py-3 font-mono">
                      <Link
                        href={`/admin/tickets/${ticket.ticketUuid}`}
                        className="underline underline-offset-4"
                      >
                        {ticket.ticketId}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{ticket.issueTitle}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`v2-badge ${statusToken(ticket.status)}`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {ticket.assignedAgent || "Unassigned"}
                    </td>
                    <td className="px-4 py-3">
                      {ticket.slaState}
                      {!["Resolved", "Closed"].includes(ticket.status) &&
                        formatSlaCountdown(
                          ticket.humanResponseDueAt ?? null,
                          new Date(now)
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 md:hidden">
          {tickets.map((ticket) => {
            const Icon = statusIcon(ticket.status);
            return (
              <article
                key={ticket.ticketUuid}
                className="border-b border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/admin/tickets/${ticket.ticketUuid}`}
                    className="font-mono text-sm underline underline-offset-4"
                  >
                    {ticket.ticketId}
                  </Link>
                  <span className={`v2-badge ${statusToken(ticket.status)}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {ticket.status}
                  </span>
                </div>
                <h3 className="mt-2 font-medium">{ticket.issueTitle}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div>
                    <dt className="font-medium text-foreground">Agent</dt>
                    <dd>{ticket.assignedAgent || "Unassigned"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-foreground">SLA</dt>
                    <dd>{ticket.slaState}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="bg-muted/60 backdrop-blur">
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
            <tr
              key={ticket.ticketUuid}
              className="border-t border-border transition-colors hover:bg-muted/40"
            >
              <td className="px-4 py-3 font-mono">
                <Link
                  href={`/admin/tickets/${ticket.ticketUuid}`}
                  className="underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <td className="px-4 py-3">
                <span
                  className={`glass-pill px-2 py-1 text-xs ${priorityTone(ticket.priority)}`}
                >
                  {ticket.priority}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`glass-pill px-2 py-1 text-xs ${statusTone(ticket.status)}`}
                >
                  {ticket.status}
                </span>
              </td>
              <td className="px-4 py-3">{ticket.resolvedBy ?? "—"}</td>
              <td className="px-4 py-3">
                {ticket.assignedAgent || "Unassigned"}
              </td>
              <td className="px-4 py-3">
                <span className="glass-pill px-2 py-1 text-xs">
                  {ticket.slaState}
                </span>
                {!["Resolved", "Closed"].includes(ticket.status) &&
                  formatSlaCountdown(
                    ticket.humanResponseDueAt ?? null,
                    new Date(now)
                  ) && (
                    <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">
                      {formatSlaCountdown(
                        ticket.humanResponseDueAt ?? null,
                        new Date(now)
                      )}
                    </span>
                  )}
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
  workflowEnabled = false,
  organizationPolicy,
  uiV2 = false,
}: {
  initialSnapshot: OperationsData;
  resolutionTrackingEnabled?: boolean;
  workflowEnabled?: boolean;
  organizationPolicy?: OrganizationPolicy;
  uiV2?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTime = Date.parse(initialSnapshot.generatedAt);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [filters, setFilters] = useState(initialSnapshot.filters);
  const [lastSuccessAt, setLastSuccessAt] = useState(initialTime);
  const [now, setNow] = useState(initialTime);
  const [status, setStatus] = useState<RefreshStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const referenceFilter = searchParams.get("ref")?.trim().toLowerCase() ?? "";
  const [policyEnabled, setPolicyEnabled] = useState(
    organizationPolicy?.allowVerificationException ?? false
  );
  const FilterContainer = uiV2 ? "details" : "div";
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) =>
      !["page", "pageSize", "from", "to"].includes(key) &&
      value !== undefined &&
      value !== ""
  ).length;
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
  const visibleTickets = referenceFilter
    ? snapshot.tickets.rows.filter((ticket) =>
        `${ticket.ticketId} ${ticket.issueTitle}`
          .toLowerCase()
          .includes(referenceFilter)
      )
    : snapshot.tickets.rows;
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
  const savePolicy = () => {
    const next = !policyEnabled;
    setPolicyEnabled(next);
    void updateOrganizationPolicy(next).then((result) => {
      if ("error" in result) {
        setPolicyEnabled(!next);
        setError(result.error);
      }
    });
  };

  return (
    <div>
      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Operations</h1>
            <p className="mt-2 text-muted-foreground">
              Live support operations dashboard.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Organization: {snapshot.organizationName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={
                freshness === "LIVE"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : freshness === "DELAYED"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-destructive"
              }
            >
              {freshness === "LIVE" ? "✓ " : ""}
              {freshness}
            </span>
            <span className="text-sm text-muted-foreground">
              Last updated {formatTime(lastSuccessAt)}
            </span>
            <span className="text-sm text-muted-foreground">
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
            className="rounded-2xl bg-destructive/10 p-3 text-destructive"
          >
            {error}
          </p>
        )}
        {staleMessage && (
          <p className="rounded-2xl bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
            {staleMessage}
          </p>
        )}
        {organizationPolicy && snapshot.role === "org_admin" && (
          <section className="glass p-5">
            <h2 className="font-semibold">Organization policy</h2>
            <label className="mt-3 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={policyEnabled}
                onChange={savePolicy}
              />
              Allow verification exceptions
            </label>
          </section>
        )}
        {workflowEnabled && snapshot.workflow && (
          <section className="glass p-5">
            <h2 className="text-xl font-semibold">Ticket workflow</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Needs human", snapshot.workflow.needsHuman],
                ["AI resolving", snapshot.workflow.aiResolving],
                ["In progress", snapshot.workflow.inProgress],
                ["Waiting for user", snapshot.workflow.waitingForUser],
                ["Pending verification", snapshot.workflow.pendingVerification],
                ["SLA at risk", snapshot.workflow.slaAtRisk],
                ["Resolved by AI", snapshot.workflow.resolvedByAi],
                [
                  "Resolved by employees",
                  snapshot.workflow.resolvedByEmployees,
                ],
                [
                  "Avg satisfaction",
                  snapshot.workflow.avgSatisfaction === null
                    ? "—"
                    : `${snapshot.workflow.avgSatisfaction.toFixed(1)} / 5`,
                ],
                ["Reopened", snapshot.workflow.reopenedCount],
              ].map(([label, value]) => (
                <div key={label} className="glass p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-bold">{value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div
          id={uiV2 ? "analytics" : undefined}
          className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
        >
          {metricLabels.map(([key, label]) => (
            <div key={key} className={`glass p-4 ${metricTone(key)}`}>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-3xl font-bold">
                {["avgFirstResponseMinutes", "avgResolutionMinutes"].includes(
                  key
                )
                  ? (snapshot.metrics[key] as number).toFixed(1)
                  : (snapshot.metrics[key] as number)}
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
            <section key={title as string} className="glass p-5">
              <h2 className="font-semibold">{title as string}</h2>
              <div className="mt-4 space-y-3">
                {(items as { key: string; count: number }[]).map((item) => (
                  <div key={item.key}>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{item.key}</span>
                      <span>{item.count}</span>
                    </div>
                    <div
                      role="img"
                      className="mt-1 h-2 rounded-full bg-primary"
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

        <section
          tabIndex={0}
          aria-label="Agent workload"
          className="glass-strong overflow-x-auto"
        >
          <h2 className="border-b border-border p-5 font-semibold">
            Agent workload
          </h2>
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-muted/60 backdrop-blur">
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
                <tr
                  key={row.agent}
                  className="border-t border-border transition-colors hover:bg-muted/40"
                >
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
          <section className="glass space-y-5 p-5">
            <h2 className="font-semibold">Resolution tracking</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
              {[
                [
                  "Total tickets",
                  snapshot.resolution.totalTickets,
                  "border-border bg-card/40",
                ],
                [
                  "Solved by AI",
                  snapshot.resolution.aiSolved,
                  "border-emerald-500/30 bg-emerald-500/10",
                ],
                [
                  "Solved by agents",
                  snapshot.resolution.agentSolved,
                  "border-primary/30 bg-primary/10",
                ],
                [
                  "Escalated",
                  snapshot.resolution.escalated,
                  "border-amber-500/30 bg-amber-500/10",
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
                  "border-border bg-card/40",
                ],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className={`glass p-4 ${tone}`}>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-bold">{value}</p>
                  {label === "AI resolution rate" && (
                    <p className="mt-1 text-xs text-muted-foreground">
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
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">
                  No resolution activity.
                </p>
              ) : (
                snapshot.resolution.daily.map((point) => {
                  const total =
                    point.aiSolved + point.agentSolved + point.escalated;
                  const width = Math.max(total, 1);
                  return (
                    <div key={point.day} className="flex items-center gap-3">
                      <span className="w-24 text-xs text-muted-foreground">
                        {point.day}
                      </span>
                      <div className="flex h-5 flex-1 overflow-hidden rounded-full bg-muted">
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

        <section id="tickets" className="glass-strong overflow-hidden">
          <div className="border-b border-border p-5">
            <h2 className="font-semibold">Tickets</h2>
            {uiV2 && (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {[
                  ["Needs Human", "needs_human"],
                  ["Unassigned", "unassigned"],
                  ["Assigned to Me", "assigned_to_me"],
                  ["AI Reviewing", "ai_working"],
                  ["AI Resolving", "ai_working"],
                  ["In Progress", "In Progress"],
                  ["Waiting for User", "waiting"],
                  ["Pending Verification", "Pending Verification"],
                  ["SLA At Risk", "sla_breached"],
                  ["Resolved", "resolved"],
                  ["Reopened", "reopened"],
                ].map(([label, value]) => (
                  <button
                    key={label}
                    type="button"
                    className="v2-touch shrink-0 rounded-full border border-border px-3 py-2 text-sm hover:bg-muted"
                    onClick={() =>
                      updateFilter(
                        value === "In Progress" ||
                          value === "Pending Verification"
                          ? "status"
                          : "queue",
                        value
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <FilterContainer
              className={`mt-4 grid gap-3 ${
                uiV2
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 [&_input]:w-full [&_input]:min-w-0 [&_select]:w-full [&_select]:min-w-0"
                  : ""
              }`}
              {...(uiV2 ? { open: true } : {})}
            >
              {uiV2 && (
                <summary className="v2-touch col-span-full cursor-pointer list-none rounded-xl border border-border px-3 py-2 font-medium md:hidden">
                  Filters ({activeFilterCount} active)
                </summary>
              )}
              <select
                aria-label="Status"
                value={filters.status ?? ""}
                onChange={(event) => updateFilter("status", event.target.value)}
                className="h-10 rounded-2xl border border-border/70 bg-background/60 px-3 backdrop-blur"
              >
                <option value="">All statuses</option>
                <option>New</option>
                <option>In Progress</option>
                <option>Waiting</option>
                <option>Resolved</option>
                <option>Closed</option>
                {workflowEnabled && (
                  <>
                    <option>AI Reviewing</option>
                    <option>AI Resolving</option>
                    <option>Needs Human</option>
                    <option>Waiting for User</option>
                    <option>Pending Verification</option>
                    <option>Reopened</option>
                  </>
                )}
              </select>
              {workflowEnabled && (
                <select
                  aria-label="Queue"
                  value={filters.queue ?? ""}
                  onChange={(event) =>
                    updateFilter("queue", event.target.value)
                  }
                  className="h-10 rounded-2xl border border-border/70 bg-background/60 px-3 backdrop-blur"
                >
                  <option value="">All queues</option>
                  <option value="needs_human">Needs human</option>
                  <option value="assigned_to_me">Assigned to me</option>
                  <option value="unassigned">Unassigned</option>
                  <option value="ai_working">AI working</option>
                  <option value="waiting">Waiting</option>
                  <option value="sla_breached">SLA breached</option>
                  <option value="resolved">Resolved</option>
                  <option value="reopened">Reopened</option>
                </select>
              )}
              {workflowEnabled && (
                <>
                  <select
                    aria-label="Risk"
                    value={filters.risk ?? ""}
                    onChange={(event) =>
                      updateFilter("risk", event.target.value)
                    }
                    className="h-10 rounded-2xl border border-border/70 bg-background/60 px-3 backdrop-blur"
                  >
                    <option value="">All risks</option>
                    <option value="low">Low risk</option>
                    <option value="medium">Medium risk</option>
                    <option value="high">High risk</option>
                  </select>
                  <select
                    aria-label="Handoff reason"
                    value={filters.handoffReason ?? ""}
                    onChange={(event) =>
                      updateFilter("handoffReason", event.target.value)
                    }
                    className="h-10 rounded-2xl border border-border/70 bg-background/60 px-3 backdrop-blur"
                  >
                    <option value="">All handoff reasons</option>
                    <option value="admin_access_required">
                      Admin access required
                    </option>
                    <option value="credentials">Credentials</option>
                    <option value="credentials_involved">
                      Credentials involved
                    </option>
                    <option value="malware">Security concern</option>
                    <option value="unauthorized_access">
                      Unauthorized access
                    </option>
                    <option value="security_concern">Security concern</option>
                    <option value="hardware">Hardware</option>
                    <option value="hardware_repair">Hardware repair</option>
                    <option value="remote_assistance">Remote assistance</option>
                    <option value="remote_assistance_required">
                      Remote assistance
                    </option>
                    <option value="low_confidence">Low confidence</option>
                    <option value="no_guide">No guide</option>
                    <option value="no_approved_guide">No approved guide</option>
                    <option value="repeated_failure">Repeated failure</option>
                    <option value="user_requested_human">
                      User requested human
                    </option>
                    <option value="too_many_questions">
                      Too many questions
                    </option>
                    <option value="insufficient_diagnostics">
                      Insufficient diagnostics
                    </option>
                    <option value="employee_requested_human">
                      Employee requested human
                    </option>
                    <option value="reopened_by_user">Reopened by user</option>
                  </select>
                  <Input
                    aria-label="Minimum AI confidence"
                    type="number"
                    min={0}
                    max={100}
                    value={filters.minConfidence ?? ""}
                    onChange={(event) =>
                      updateFilter(
                        "minConfidence",
                        event.target.value === ""
                          ? ""
                          : Number(event.target.value)
                      )
                    }
                    placeholder="Min AI confidence"
                  />
                </>
              )}
              {snapshot.resolution && (
                <select
                  aria-label="Resolution"
                  value={filters.resolutionSource ?? ""}
                  onChange={(event) =>
                    updateFilter("resolutionSource", event.target.value)
                  }
                  className="h-10 rounded-2xl border border-border/70 bg-background/60 px-3 backdrop-blur"
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
                className="h-10 rounded-2xl border border-border/70 bg-background/60 px-3 backdrop-blur"
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
                className="h-10 rounded-2xl border border-border/70 bg-background/60 px-3 backdrop-blur"
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
                className="h-10 rounded-2xl border border-border/70 bg-background/60 px-3 backdrop-blur"
              >
                <option value="">All SLA states</option>
                <option value="on_track">On track</option>
                <option value="due_soon">Due &lt;1h</option>
                <option value="breached">Breached</option>
                <option value="closed">Closed</option>
              </select>
            </FilterContainer>
          </div>
          {status === "refreshing" && (
            <div className="p-5 text-sm text-muted-foreground">
              Loading operations data…
            </div>
          )}
          {visibleTickets.length === 0 && status !== "refreshing" ? (
            <p className="p-8 text-center text-muted-foreground">
              No tickets match these filters
            </p>
          ) : (
            <TicketTable tickets={visibleTickets} now={now} uiV2={uiV2} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
            <span className="text-sm text-muted-foreground">
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
                className="h-10 rounded-2xl border border-border/70 bg-background/60 px-3 backdrop-blur"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </section>
        <p className="text-sm text-muted-foreground">
          Pseudonymous operations data only — no emails, messages, or
          attachments.
        </p>
      </div>
    </div>
  );
}
