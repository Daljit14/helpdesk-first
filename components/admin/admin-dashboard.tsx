"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  Flame,
  Inbox,
  MessageSquareReply,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Timer,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { CountUp, Donut, Sparkline } from "@/components/admin/ops/visuals";
import { ResolutionChart } from "@/components/admin/ops/resolution-chart";

type RefreshStatus = "idle" | "refreshing" | "error";
type Freshness = "LIVE" | "DELAYED" | "STALE";
type TabId = "overview" | "tickets" | "team" | "policy";
type Tone = "danger" | "warn" | "info" | "good" | "neutral";

const CONTROL =
  "h-10 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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

const ADVANCED_FILTER_KEYS: (keyof AdminFilters)[] = [
  "risk",
  "handoffReason",
  "minConfidence",
  "resolutionSource",
  "category",
  "platform",
  "agent",
];

const queueFilterLabels: Record<NonNullable<AdminFilters["queue"]>, string> = {
  needs_human: "Needs Human",
  assigned_to_me: "Assigned to Me",
  unassigned: "Unassigned",
  ai_working: "AI working",
  waiting: "Waiting for User",
  sla_breached: "SLA At Risk",
  resolved: "Resolved",
  reopened: "Reopened",
};

const handoffReasonLabels: Record<string, string> = {
  admin_access_required: "Admin access required",
  credentials: "Credentials",
  credentials_involved: "Credentials involved",
  malware: "Security concern",
  unauthorized_access: "Unauthorized access",
  security_concern: "Security concern",
  hardware: "Hardware",
  hardware_repair: "Hardware repair",
  remote_assistance: "Remote assistance",
  remote_assistance_required: "Remote assistance",
  low_confidence: "Low confidence",
  no_guide: "No guide",
  no_approved_guide: "No approved guide",
  repeated_failure: "Repeated failure",
  user_requested_human: "User requested human",
  agent_halted: "AI assistant stopped",
  too_many_questions: "Too many questions",
  insufficient_diagnostics: "Insufficient diagnostics",
  employee_requested_human: "Employee requested human",
  reopened_by_user: "Reopened by user",
};

const resolutionSourceLabels: Record<
  NonNullable<AdminFilters["resolutionSource"]>,
  string
> = {
  ai: "Solved by AI",
  agent: "Solved by agent",
  self_service: "Self-service",
  unresolved: "Unresolved",
};

const slaFilterLabels: Record<string, string> = {
  on_track: "On track",
  due_soon: "Due <1h",
  breached: "Breached",
  closed: "Closed",
};

const TONE: Record<Tone, { icon: string; text: string; ring: string }> = {
  danger: {
    icon: "bg-status-danger/15 text-status-danger",
    text: "text-status-danger",
    ring: "border-status-danger/40",
  },
  warn: {
    icon: "bg-status-warning/15 text-status-warning",
    text: "text-status-warning",
    ring: "border-status-warning/40",
  },
  info: {
    icon: "bg-secondary text-secondary-foreground",
    text: "text-primary",
    ring: "border-primary/40",
  },
  good: {
    icon: "bg-status-success/15 text-status-success",
    text: "text-status-success",
    ring: "border-status-success/40",
  },
  neutral: {
    icon: "bg-muted text-muted-foreground",
    text: "text-muted-foreground",
    ring: "border-border",
  },
};

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

function statusTone(status: string) {
  switch (status) {
    case "New":
    case "AI Reviewing":
    case "AI Resolving":
      return "bg-secondary text-secondary-foreground";
    case "Needs Human":
    case "Reopened":
      return "bg-status-warning/15 text-status-warning";
    case "In Progress":
      return "bg-status-info/15 text-status-info";
    case "Waiting":
    case "Waiting for User":
      return "bg-accent text-accent-foreground";
    case "Pending Verification":
      return "bg-[color-mix(in_srgb,var(--adm-agent)_18%,transparent)] text-foreground";
    case "Resolved":
      return "bg-status-success/15 text-status-success";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusIcon(status: string) {
  if (status === "Resolved" || status === "Closed") return CheckCircle2;
  if (status === "Reopened") return RotateCcw;
  if (status === "Needs Human") return AlertTriangle;
  if (status === "Waiting" || status === "Waiting for User") return Clock;
  if (status === "AI Reviewing" || status === "AI Resolving") return Bot;
  return Circle;
}

function priorityTone(priority: string) {
  switch (priority) {
    case "Urgent":
      return "bg-status-danger/15 text-status-danger";
    case "High":
      return "bg-status-warning/15 text-status-warning";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function slaTone(state: string) {
  if (state === "Breached") return "bg-status-danger/15 text-status-danger";
  if (state === "Due <1h") return "bg-status-warning/15 text-status-warning";
  if (state === "On track") return "bg-status-success/15 text-status-success";
  return "bg-muted text-muted-foreground";
}

function makeQuery(filters: AdminFilters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  // Stop spreadsheet apps from treating a cell as a formula.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportTicketsCsv(tickets: AdminOperationsTicket[]) {
  const header = [
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
  ];
  const rows = tickets.map((t) => [
    t.ticketId,
    t.createdAt,
    t.issueTitle,
    t.category,
    t.platform,
    t.priority,
    t.status,
    t.resolvedBy ?? "",
    t.assignedAgent || "Unassigned",
    t.slaState,
    t.lastUpdatedAt,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** "updated 12s ago" — ticks on its own so the whole dashboard does not re-render. */
function Ago({ since }: { since: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);
  if (now === null) return <>updated just now</>;
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  if (seconds < 60) return <>updated {seconds}s ago</>;
  return <>updated {Math.floor(seconds / 60)}m ago</>;
}

function FreshnessPill({
  freshness,
  uiV2,
  since,
}: {
  freshness: Freshness;
  uiV2: boolean;
  since: number;
}) {
  const dot =
    freshness === "LIVE"
      ? "bg-status-success"
      : freshness === "DELAYED"
        ? "bg-status-warning"
        : "bg-status-danger";
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-extrabold text-foreground shadow-sm">
      <span className="relative h-2 w-2" aria-hidden>
        {freshness === "LIVE" && (
          <span className={`hf-ping absolute inset-0 rounded-full ${dot}`} />
        )}
        <span className={`absolute inset-0 rounded-full ${dot}`} />
      </span>
      <span
        className={
          uiV2
            ? "text-foreground"
            : freshness === "LIVE"
              ? "text-emerald-600 dark:text-emerald-400"
              : freshness === "DELAYED"
                ? "text-amber-600 dark:text-amber-400"
                : "text-destructive"
        }
      >
        {freshness}
      </span>
      <span className="font-semibold text-muted-foreground">
        · <Ago since={since} />
      </span>
    </span>
  );
}

function Card({
  children,
  className = "",
  delay = 0,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { delay?: number }) {
  return (
    <section
      {...rest}
      className={`glass hf-rise p-5 sm:p-6 ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </section>
  );
}

function AttentionCard({
  label,
  value,
  tone,
  icon: Icon,
  index,
  onSelect,
}: {
  label: string;
  value: number;
  tone: Tone;
  icon: LucideIcon;
  index: number;
  onSelect: () => void;
}) {
  const hot = value > 0 && (tone === "danger" || tone === "warn");
  const t = TONE[tone];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`glass hf-adm-card hf-rise flex flex-col gap-1.5 p-4 text-left ${hot ? t.ring : ""}`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <span className="flex items-center justify-between">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${t.icon}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        {hot && (
          <span
            aria-hidden
            className={`hf-adm-alarm h-2.5 w-2.5 rounded-full ${tone === "danger" ? "bg-status-danger" : "bg-status-warning"}`}
          />
        )}
      </span>
      <span className="text-3xl font-extrabold tracking-tight tabular-nums">
        <CountUp value={value} />
      </span>
      <span className="text-[13px] font-extrabold">{label}</span>
      <span className="text-[11px] font-semibold text-muted-foreground">
        View tickets →
      </span>
    </button>
  );
}

function BarList({
  items,
  label,
  hotAt,
}: {
  items: { key: string; count: number }[];
  label: string;
  hotAt?: number;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  if (items.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">No {label} data yet.</p>
    );
  }
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item, index) => (
        <li key={item.key} className="space-y-1.5 text-[13px] font-bold">
          <span className="flex justify-between gap-3">
            <span className="truncate">{item.key}</span>
            <span className="text-muted-foreground tabular-nums">
              {item.count}
            </span>
          </span>
          <span className="block h-2 overflow-hidden rounded-full bg-muted">
            <span
              role="img"
              aria-label={`${item.key}: ${item.count}`}
              className={`hf-adm-grow block h-full rounded-full ${
                hotAt !== undefined && item.count >= hotAt
                  ? "hf-adm-hot"
                  : "hf-adm-bar"
              }`}
              style={{
                width: `${(item.count / max) * 100}%`,
                animationDelay: `${0.3 + index * 0.07}s`,
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function TicketTable({
  tickets,
  now,
}: {
  tickets: AdminOperationsTicket[];
  now: number;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              {[
                "Ticket #",
                "Issue title",
                "Category",
                "Priority",
                "Status",
                "Agent",
                "SLA status",
                "Last updated",
              ].map((heading) => (
                <th key={heading} className="px-4 py-3 font-bold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket, index) => {
              const Icon = statusIcon(ticket.status);
              const open = !["Resolved", "Closed"].includes(ticket.status);
              const countdown = open
                ? formatSlaCountdown(
                    ticket.humanResponseDueAt ?? null,
                    new Date(now)
                  )
                : null;
              const edge =
                open && ticket.slaState === "Breached"
                  ? "border-l-status-danger"
                  : open && ticket.slaState === "Due <1h"
                    ? "border-l-status-warning"
                    : "border-l-transparent";
              return (
                <tr
                  key={ticket.ticketUuid}
                  className="hf-adm-row border-t border-border transition-colors hover:bg-muted/50"
                  style={{ animationDelay: `${Math.min(index, 12) * 0.03}s` }}
                >
                  <td className={`border-l-4 px-4 py-3 ${edge}`}>
                    <Link
                      href={`/admin/tickets/${ticket.ticketUuid}`}
                      className="font-mono font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {ticket.ticketId}
                    </Link>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {new Date(ticket.createdAt).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold">
                    {ticket.issueTitle}
                    {ticket.resolvedBy && (
                      <span className="mt-0.5 block text-[11px] font-semibold text-muted-foreground">
                        Resolved by {ticket.resolvedBy}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {ticket.category}
                    <span className="block text-[11px]">{ticket.platform}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${priorityTone(ticket.priority)}`}
                    >
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${statusTone(ticket.status)}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {ticket.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {ticket.assignedAgent || "Unassigned"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${slaTone(ticket.slaState)}`}
                    >
                      {ticket.slaState}
                    </span>
                    {countdown && (
                      <span className="mt-1 block whitespace-nowrap text-[11px] font-semibold text-muted-foreground">
                        {countdown}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {new Date(ticket.lastUpdatedAt).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {tickets.map((ticket) => {
          const Icon = statusIcon(ticket.status);
          return (
            <article key={ticket.ticketUuid} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/admin/tickets/${ticket.ticketUuid}`}
                  className="font-mono text-sm font-bold text-primary underline underline-offset-4"
                >
                  {ticket.ticketId}
                </Link>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${statusTone(ticket.status)}`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {ticket.status}
                </span>
              </div>
              <h3 className="mt-2 font-bold">{ticket.issueTitle}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                <div>
                  <dt className="font-bold text-foreground">Agent</dt>
                  <dd>{ticket.assignedAgent || "Unassigned"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-foreground">SLA</dt>
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
  const [tab, setTab] = useState<TabId>("overview");
  const [search, setSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const referenceFilter = searchParams.get("ref")?.trim().toLowerCase() ?? "";
  const [policyEnabled, setPolicyEnabled] = useState(
    organizationPolicy?.allowVerificationException ?? false
  );
  const showPolicy =
    Boolean(organizationPolicy) && snapshot.role === "org_admin";

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

  const applyFilters = useCallback(
    (next: AdminFilters) => {
      setFilters(next);
      router.replace(`/admin/operations?${makeQuery(next)}`, { scroll: false });
      void refresh(next);
    },
    [refresh, router]
  );

  const updateFilter = (key: keyof AdminFilters, value: string | number) =>
    applyFilters({ ...filters, [key]: value, page: 1 });

  const quickFilter = (patch: Partial<AdminFilters>) => {
    applyFilters({
      ...filters,
      queue: undefined,
      status: undefined,
      priority: undefined,
      sla: undefined,
      ...patch,
      page: 1,
    });
    setTab("tickets");
  };

  // Sidebar links such as "Ticket Queue" (#tickets) and "AI Investigations"
  // (?queue=ai_working) land here: open the Tickets tab and apply the queue.
  const urlQueue = searchParams.get("queue");
  const appliedUrlQueue = useRef<string | null>(null);
  useEffect(() => {
    const openTicketsFromHash = () => {
      if (window.location.hash === "#tickets")
        queueMicrotask(() => setTab("tickets"));
    };
    openTicketsFromHash();
    window.addEventListener("hashchange", openTicketsFromHash);
    return () => window.removeEventListener("hashchange", openTicketsFromHash);
  }, []);
  useEffect(() => {
    if (!urlQueue || appliedUrlQueue.current === urlQueue) return;
    appliedUrlQueue.current = urlQueue;
    queueMicrotask(() => {
      setTab("tickets");
      if (filters.queue !== urlQueue)
        applyFilters({
          ...filters,
          queue: urlQueue as AdminFilters["queue"],
          page: 1,
        });
    });
  }, [urlQueue, filters, applyFilters]);

  const age = now - lastSuccessAt;
  const freshness: Freshness =
    status === "error" || age > 10 * 60_000
      ? "STALE"
      : age > 6 * 60_000
        ? "DELAYED"
        : "LIVE";
  const totalPages = Math.max(
    1,
    Math.ceil(snapshot.tickets.total / snapshot.tickets.pageSize)
  );
  const needle = `${referenceFilter} ${search.trim().toLowerCase()}`.trim();
  const visibleTickets = useMemo(() => {
    const terms = needle.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return snapshot.tickets.rows;
    return snapshot.tickets.rows.filter((ticket) => {
      const haystack =
        `${ticket.ticketId} ${ticket.issueTitle} ${ticket.category} ${ticket.assignedAgent}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [needle, snapshot.tickets.rows]);
  const staleMessage = useMemo(
    () => (freshness === "STALE" ? "Data may be out of date." : null),
    [freshness]
  );
  const advancedCount = ADVANCED_FILTER_KEYS.filter(
    (key) => filters[key] !== undefined && filters[key] !== ""
  ).length;
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) =>
      !["page", "pageSize", "from", "to", "showExcluded"].includes(key) &&
      value !== undefined &&
      value !== ""
  ).length;
  const activeFilterTags = [
    filters.queue
      ? {
          label: `Queue: ${queueFilterLabels[filters.queue]}`,
          clear: () => applyFilters({ ...filters, queue: undefined, page: 1 }),
        }
      : null,
    filters.status
      ? {
          label: `Status: ${filters.status}`,
          clear: () => applyFilters({ ...filters, status: "", page: 1 }),
        }
      : null,
    filters.risk
      ? {
          label: `Risk: ${filters.risk[0].toUpperCase()}${filters.risk.slice(1)} risk`,
          clear: () => applyFilters({ ...filters, risk: undefined, page: 1 }),
        }
      : null,
    filters.handoffReason
      ? {
          label: `Handoff: ${
            handoffReasonLabels[filters.handoffReason] ?? filters.handoffReason
          }`,
          clear: () => applyFilters({ ...filters, handoffReason: "", page: 1 }),
        }
      : null,
    filters.minConfidence !== undefined
      ? {
          label: `AI confidence: ${filters.minConfidence}%`,
          clear: () =>
            applyFilters({ ...filters, minConfidence: undefined, page: 1 }),
        }
      : null,
    filters.resolutionSource
      ? {
          label: `Resolution: ${
            resolutionSourceLabels[filters.resolutionSource]
          }`,
          clear: () =>
            applyFilters({ ...filters, resolutionSource: undefined, page: 1 }),
        }
      : null,
    filters.priority
      ? {
          label: `Priority: ${filters.priority}`,
          clear: () => applyFilters({ ...filters, priority: "", page: 1 }),
        }
      : null,
    filters.category
      ? {
          label: `Category: ${filters.category}`,
          clear: () => applyFilters({ ...filters, category: "", page: 1 }),
        }
      : null,
    filters.platform
      ? {
          label: `Platform: ${filters.platform}`,
          clear: () => applyFilters({ ...filters, platform: "", page: 1 }),
        }
      : null,
    filters.agent
      ? {
          label: `Agent: ${filters.agent}`,
          clear: () => applyFilters({ ...filters, agent: "", page: 1 }),
        }
      : null,
    filters.sla
      ? {
          label: `SLA: ${slaFilterLabels[filters.sla] ?? filters.sla}`,
          clear: () => applyFilters({ ...filters, sla: "", page: 1 }),
        }
      : null,
  ].filter((tag): tag is { label: string; clear: () => void } => tag !== null);
  const allFiltersInactive = activeFilterCount === 0;

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

  const { metrics, workflow, resolution } = snapshot;
  const daily = resolution?.daily ?? [];
  const atRisk = workflow ? workflow.slaAtRisk : metrics.slaBreached;
  const summary =
    atRisk > 0
      ? `${atRisk} ${atRisk === 1 ? "ticket is" : "tickets are"} at SLA risk — start with the highlighted cards below.`
      : "All caught up — no tickets at SLA risk right now.";

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "tickets", label: "Tickets", count: snapshot.tickets.total },
    { id: "team", label: "Team", count: metrics.agentWorkload.length },
    ...(showPolicy ? [{ id: "policy" as const, label: "Policy" }] : []),
  ];
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const onTabKey = (event: React.KeyboardEvent, index: number) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    const next = tabs[nextIndex].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const attention: {
    label: string;
    value: number;
    tone: Tone;
    icon: LucideIcon;
    filter: Partial<AdminFilters>;
  }[] = workflow
    ? [
        {
          label: "SLA at risk",
          value: workflow.slaAtRisk,
          tone: "danger",
          icon: AlertTriangle,
          filter: { queue: "sla_breached" },
        },
        {
          label: "SLA breached",
          value: workflow.slaBreached,
          tone: "danger",
          icon: Flame,
          filter: { sla: "breached" },
        },
        {
          label: "Needs human",
          value: workflow.needsHuman,
          tone: "warn",
          icon: UserRound,
          filter: { queue: "needs_human" },
        },
        {
          label: "Unassigned",
          value: workflow.unassignedNeedsHuman,
          tone: "warn",
          icon: Inbox,
          filter: { queue: "unassigned" },
        },
        {
          label: "Urgent open",
          value: metrics.urgentOpenTickets,
          tone: "danger",
          icon: Timer,
          filter: { priority: "Urgent" },
        },
        {
          label: "Reopened",
          value: workflow.reopenedCount,
          tone: "info",
          icon: RotateCcw,
          filter: { queue: "reopened" },
        },
      ]
    : [
        {
          label: "Urgent open",
          value: metrics.urgentOpenTickets,
          tone: "danger",
          icon: Timer,
          filter: { priority: "Urgent" },
        },
        {
          label: "SLA breached",
          value: metrics.slaBreached,
          tone: "danger",
          icon: Flame,
          filter: { sla: "breached" },
        },
        {
          label: "Waiting",
          value: metrics.waitingTickets,
          tone: "warn",
          icon: Clock,
          filter: { status: "Waiting" },
        },
        {
          label: "New tickets",
          value: metrics.newTickets,
          tone: "info",
          icon: Inbox,
          filter: { status: "New" },
        },
      ];

  const createdSeries = daily.map((point) => point.created);
  const solvedSeries = daily.map(
    (point) => point.aiSolved + point.agentSolved + point.escalated
  );
  const kpis: {
    label: string;
    value: number;
    decimals?: number;
    suffix?: string;
    sub: string;
    series?: number[];
    icon: LucideIcon;
  }[] = [
    {
      label: "Open tickets",
      value: metrics.openTickets,
      sub: `of ${metrics.totalTickets} total`,
      series: createdSeries,
      icon: Inbox,
    },
    {
      label: "Completed today",
      value: metrics.completedToday,
      sub: `${metrics.totalCompleted} completed overall`,
      series: solvedSeries,
      icon: CheckCircle2,
    },
    {
      label: "Avg first response",
      value: metrics.avgFirstResponseMinutes,
      decimals: 1,
      suffix: " min",
      sub: "Time to first reply",
      icon: MessageSquareReply,
    },
    {
      label: "Avg resolution",
      value: metrics.avgResolutionMinutes / 60,
      decimals: 1,
      suffix: " h",
      sub: formatDuration(metrics.avgResolutionMinutes) + " open → resolved",
      icon: Timer,
    },
  ];

  const flow = workflow
    ? [
        {
          label: "AI resolving",
          value: workflow.aiResolving,
          color: "var(--adm-agent)",
        },
        {
          label: "Needs human",
          value: workflow.needsHuman,
          color: "var(--adm-esc)",
        },
        {
          label: "In progress",
          value: workflow.inProgress,
          color: "var(--primary)",
        },
        {
          label: "Waiting for user",
          value: workflow.waitingForUser,
          color: "var(--muted-foreground)",
        },
        {
          label: "Pending verification",
          value: workflow.pendingVerification,
          color: "var(--adm-accent-2)",
        },
        {
          label: "Completed today",
          value: metrics.completedToday,
          color: "var(--status-success)",
        },
      ]
    : [];
  const flowMax = Math.max(1, ...flow.map((stage) => stage.value));
  const teamLoad = metrics.agentWorkload
    .map((row) => ({ key: row.agent || "Unassigned", count: row.open }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const sparks = Array.from({ length: 10 }, (_, i) => i);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* ---------- Hero ---------- */}
      <section className="hf-adm-hero hf-rise relative overflow-hidden rounded-[28px] px-5 pt-6 shadow-[0_24px_50px_-28px_var(--primary)] sm:px-7">
        <span
          aria-hidden
          className="hf-adm-blob pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.28),transparent)]"
        />
        <span
          aria-hidden
          className="hf-adm-blob-b pointer-events-none absolute -bottom-32 left-[38%] h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgb(255_214_248/0.4),transparent)]"
        />
        {sparks.map((i) => (
          <span
            key={i}
            aria-hidden
            className="hf-adm-spark"
            style={{
              left: `${6 + i * 9.5}%`,
              width: 4 + (i % 3) * 2,
              height: 4 + (i % 3) * 2,
              animationDuration: `${4 + (i % 4)}s`,
              animationDelay: `${i * 0.6}s`,
            }}
          />
        ))}
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white/85">
              Organization: {snapshot.organizationName}
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Operations
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] font-semibold text-white/90">
              {summary}
            </p>
            <p className="mt-1 text-xs font-semibold text-white/75">
              Live support operations dashboard · Last updated{" "}
              {formatTime(lastSuccessAt)} · Next refresh{" "}
              {formatTime(lastSuccessAt + 300_000)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FreshnessPill
              freshness={freshness}
              uiV2={uiV2}
              since={lastSuccessAt}
            />
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={status === "refreshing"}
              aria-busy={status === "refreshing"}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/35 bg-white/15 px-3.5 text-sm font-extrabold text-white backdrop-blur transition-colors hover:bg-white/25 disabled:opacity-70"
            >
              <RefreshCw
                className={`h-4 w-4 ${status === "refreshing" ? "animate-spin" : ""}`}
                aria-hidden
              />
              Refresh now
            </button>
            <button
              type="button"
              onClick={() => exportTicketsCsv(visibleTickets)}
              disabled={visibleTickets.length === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3.5 text-sm font-extrabold text-[#3b2a8f] shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </button>
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Operations sections"
          className="relative mt-5 flex gap-1 overflow-x-auto"
        >
          {tabs.map((item, index) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  tabRefs.current[item.id] = node;
                }}
                type="button"
                role="tab"
                id={`ops-tab-${item.id}`}
                aria-selected={selected}
                aria-controls={`ops-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(item.id)}
                onKeyDown={(event) => onTabKey(event, index)}
                className={`flex h-11 shrink-0 items-center gap-2 rounded-t-2xl px-4 text-sm transition-colors ${
                  selected
                    ? "hf-swap bg-background font-extrabold text-foreground"
                    : "font-bold text-white hover:bg-white/15"
                }`}
              >
                {item.label}
                {item.count !== undefined && (
                  <span
                    className={`rounded-full px-2 text-[11px] font-extrabold ${
                      selected ? "bg-muted text-primary" : "bg-white/20"
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="flex items-center gap-2 rounded-2xl border border-status-danger/30 bg-status-danger/10 p-3 text-sm font-bold text-status-danger"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
      {staleMessage && (
        <p className="flex items-center gap-2 rounded-2xl border border-status-warning/30 bg-status-warning/10 p-3 text-sm font-bold text-status-warning">
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
          {staleMessage}
          <button
            type="button"
            onClick={() => void refresh()}
            className="ml-auto rounded-lg px-2 py-1 underline underline-offset-4 hover:bg-status-warning/10"
          >
            Try again
          </button>
        </p>
      )}

      {/* ---------- Overview ---------- */}
      <div
        role="tabpanel"
        id="ops-panel-overview"
        aria-labelledby="ops-tab-overview"
        hidden={tab !== "overview"}
        className="space-y-5"
      >
        <section aria-label="Needs attention">
          <div
            className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${
              attention.length > 4 ? "xl:grid-cols-6" : "xl:grid-cols-4"
            }`}
          >
            {attention.map((card, index) => (
              <AttentionCard
                key={card.label}
                label={card.label}
                value={card.value}
                tone={card.tone}
                icon={card.icon}
                index={index}
                onSelect={() => quickFilter(card.filter)}
              />
            ))}
          </div>
        </section>

        <section
          aria-label="Key metrics"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {kpis.map((kpi, index) => (
            <div
              key={kpi.label}
              className="glass hf-adm-card hf-rise flex flex-col gap-2 p-5"
              style={{ animationDelay: `${0.1 + index * 0.05}s` }}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-muted-foreground">
                  {kpi.label}
                </span>
                <kpi.icon className="h-4 w-4 text-primary" aria-hidden />
              </span>
              <span className="flex items-end justify-between gap-3">
                <span className="text-[28px] font-extrabold tracking-tight tabular-nums">
                  <CountUp
                    value={kpi.value}
                    decimals={kpi.decimals}
                    suffix={kpi.suffix}
                  />
                </span>
                {kpi.series && kpi.series.length > 1 && (
                  <Sparkline points={kpi.series} id={`kpi-spark-${index}`} />
                )}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                {kpi.sub}
              </span>
            </div>
          ))}
        </section>

        {resolutionTrackingEnabled && resolution && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <Card aria-labelledby="res-h" delay={0.15}>
              <h2 id="res-h" className="text-lg font-extrabold">
                Resolution tracking
              </h2>
              <p className="mb-3 text-xs font-semibold text-muted-foreground">
                Hover the chart for daily detail · click a series to hide it
              </p>
              <ResolutionChart daily={daily} />
            </Card>
            <Card
              aria-labelledby="mix-h"
              delay={0.2}
              className="flex flex-col gap-4"
            >
              <h2 id="mix-h" className="text-lg font-extrabold">
                Who solved it
              </h2>
              <div className="flex flex-wrap items-center gap-5">
                <Donut
                  label={`AI resolution rate ${resolution.aiResolutionRate}%`}
                  center={
                    <CountUp value={resolution.aiResolutionRate} suffix="%" />
                  }
                  caption="AI rate"
                  slices={[
                    {
                      label: "AI",
                      value: resolution.aiSolved,
                      color: "var(--adm-ai)",
                    },
                    {
                      label: "Agents",
                      value: resolution.agentSolved,
                      color: "var(--adm-agent)",
                    },
                    {
                      label: "Escalated",
                      value: resolution.escalated,
                      color: "var(--adm-esc)",
                    },
                  ]}
                />
                <ul className="min-w-40 flex-1 space-y-2.5 text-[13px] font-bold">
                  {[
                    ["Solved by AI", resolution.aiSolved, "var(--adm-ai)"],
                    [
                      "Solved by agents",
                      resolution.agentSolved,
                      "var(--adm-agent)",
                    ],
                    ["Escalated", resolution.escalated, "var(--adm-esc)"],
                  ].map(([label, value, color]) => (
                    <li key={String(label)} className="flex items-center gap-2">
                      <i
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-[3px]"
                        style={{ background: String(color) }}
                      />
                      {label}
                      <span className="ml-auto font-extrabold tabular-nums">
                        {value}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <dl className="grid grid-cols-2 gap-2.5 border-t border-border pt-4">
                {[
                  ["Total tickets", resolution.totalTickets],
                  ["Open", resolution.openTickets],
                  [
                    "AI resolution rate",
                    `${resolution.aiResolutionRate}%`,
                    `of ${resolution.aiAttempted ?? 0} AI-attempted`,
                  ],
                  [
                    "Avg resolution time",
                    formatDuration(resolution.avgResolutionMinutes),
                  ],
                ].map(([label, value, note]) => (
                  <div key={String(label)} className="rounded-2xl bg-muted p-3">
                    <dt className="text-xs font-bold text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-0.5 text-lg font-extrabold tabular-nums">
                      {value}
                    </dd>
                    {note && (
                      <dd className="text-[11px] font-semibold text-muted-foreground">
                        {note}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        )}

        {workflowEnabled && workflow && (
          <Card aria-labelledby="flow-h" delay={0.25}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="flow-h" className="text-lg font-extrabold">
                Ticket workflow
              </h2>
              <span className="text-xs font-semibold text-muted-foreground">
                Where every open ticket is right now
              </span>
            </div>
            <ol className="mt-4 grid gap-3 sm:grid-cols-3 xl:flex xl:items-stretch xl:gap-0">
              {flow.map((stage, index) => (
                <li key={stage.label} className="flex items-center xl:flex-1">
                  <div
                    className="hf-rise flex flex-1 flex-col gap-1.5 rounded-2xl bg-muted p-3.5"
                    style={{ animationDelay: `${0.3 + index * 0.07}s` }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          background: stage.color,
                          boxShadow: `0 0 0 4px color-mix(in srgb, ${stage.color} 22%, transparent)`,
                        }}
                      />
                      <span className="text-xs font-bold text-muted-foreground">
                        {stage.label}
                      </span>
                    </span>
                    <span className="text-2xl font-extrabold tabular-nums">
                      <CountUp value={stage.value} />
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-card">
                      <span
                        className="hf-adm-grow block h-full rounded-full"
                        style={{
                          width: `${(stage.value / flowMax) * 100}%`,
                          background: stage.color,
                          animationDelay: `${0.4 + index * 0.07}s`,
                        }}
                      />
                    </span>
                  </div>
                  {index < flow.length - 1 && (
                    <span
                      aria-hidden
                      className="relative hidden h-0.5 w-7 shrink-0 bg-[repeating-linear-gradient(90deg,var(--muted-foreground)_0_4px,transparent_4px_8px)] opacity-60 xl:block"
                    >
                      <span className="hf-adm-travel absolute -top-[2px] h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                {
                  label: "Resolved by AI",
                  value: String(workflow.resolvedByAi),
                  icon: Sparkles,
                },
                {
                  label: "Resolved by employees",
                  value: String(workflow.resolvedByEmployees),
                  icon: UsersRound,
                },
                {
                  label: "Avg satisfaction",
                  value:
                    workflow.avgSatisfaction === null
                      ? "—"
                      : `${workflow.avgSatisfaction.toFixed(1)} / 5`,
                  icon: Star,
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center gap-3 rounded-2xl border border-border p-3.5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <stat.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <dt className="text-xs font-bold text-muted-foreground">
                      {stat.label}
                    </dt>
                    <dd className="text-xl font-extrabold tabular-nums">
                      {stat.value}
                    </dd>
                  </span>
                </div>
              ))}
            </dl>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card aria-labelledby="cat-h" delay={0.3}>
            <h2 id="cat-h" className="text-lg font-extrabold">
              Tickets by category
            </h2>
            <BarList items={metrics.ticketsByCategory} label="category" />
          </Card>
          <Card aria-labelledby="plat-h" delay={0.35}>
            <h2 id="plat-h" className="text-lg font-extrabold">
              Tickets by platform
            </h2>
            <BarList items={metrics.ticketsByPlatform} label="platform" />
          </Card>
          <Card aria-labelledby="load-h" delay={0.4}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="load-h" className="text-lg font-extrabold">
                Team load
              </h2>
              <button
                type="button"
                onClick={() => setTab("team")}
                className="text-xs font-bold text-primary hover:underline"
              >
                Full workload →
              </button>
            </div>
            <BarList items={teamLoad} label="team" hotAt={6} />
          </Card>
        </div>

        <Card id="analytics" aria-labelledby="glance-h" delay={0.45}>
          <h2 id="glance-h" className="text-lg font-extrabold">
            At a glance
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
            {metricLabels.map(([key, label]) => {
              const danger =
                (key === "urgentOpenTickets" || key === "slaBreached") &&
                (metrics[key] as number) > 0;
              return (
                <div
                  key={key}
                  className={`rounded-2xl border p-3 ${
                    danger
                      ? "border-status-danger/30 bg-status-danger/10"
                      : "border-border bg-muted/50"
                  }`}
                >
                  <dt className="text-xs font-bold text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-1 text-xl font-extrabold tabular-nums">
                    {key === "avgFirstResponseMinutes" ||
                    key === "avgResolutionMinutes"
                      ? (metrics[key] as number).toFixed(1)
                      : (metrics[key] as number)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Card>
      </div>

      {/* ---------- Tickets ---------- */}
      <div
        role="tabpanel"
        id="ops-panel-tickets"
        aria-labelledby="ops-tab-tickets"
        hidden={tab !== "tickets"}
      >
        <section id="tickets" className="glass hf-rise overflow-hidden">
          <div className="space-y-4 border-b border-border p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold">Tickets</h2>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">
                    {activeFilterCount}
                  </span>
                )}
                {activeFilterTags.map((tag) => (
                  <button
                    key={tag.label}
                    type="button"
                    aria-label={`Remove ${tag.label} filter`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-1 text-xs font-bold hover:bg-muted"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      tag.clear();
                    }}
                  >
                    <span className="truncate">{tag.label}</span>
                    <span aria-hidden>×</span>
                  </button>
                ))}
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  aria-label="Clear filters"
                  onClick={() =>
                    applyFilters({
                      from: filters.from,
                      to: filters.to,
                      page: 1,
                      pageSize: filters.pageSize,
                      showExcluded: filters.showExcluded,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-primary hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Clear
                </button>
              )}
            </div>
            {uiV2 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {(
                  [
                    ["All", "all", null],
                    ["Needs Human", "queue", "needs_human"],
                    ["Unassigned", "queue", "unassigned"],
                    ["Assigned to Me", "queue", "assigned_to_me"],
                    ["AI Working", "queue", "ai_working"],
                    ["In Progress", "status", "In Progress"],
                    ["Waiting for User", "queue", "waiting"],
                    ["Pending Verification", "status", "Pending Verification"],
                    ["SLA At Risk", "queue", "sla_breached"],
                    ["Resolved", "queue", "resolved"],
                    ["Reopened", "queue", "reopened"],
                  ] as const
                ).map(([label, key, value]) => {
                  const on =
                    key === "all" ? allFiltersInactive : filters[key] === value;
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      className={`v2-touch shrink-0 rounded-full border px-3 py-1.5 text-sm font-bold transition-colors ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() =>
                        key === "all"
                          ? quickFilter({})
                          : quickFilter(
                              on
                                ? {}
                                : key === "queue"
                                  ? { queue: value as AdminFilters["queue"] }
                                  : { status: value }
                            )
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]">
              <label className="relative flex items-center sm:col-span-2 lg:col-span-1">
                <span className="sr-only">Filter tickets on this page</span>
                <Search
                  className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
                  aria-hidden
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter by ticket #, issue, category or agent…"
                  className={`${CONTROL} pl-9`}
                />
              </label>
              {workflowEnabled ? (
                <select
                  aria-label="Queue"
                  value={filters.queue ?? ""}
                  onChange={(event) =>
                    updateFilter("queue", event.target.value)
                  }
                  className={CONTROL}
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
              ) : (
                <span className="hidden lg:block" />
              )}
              <select
                aria-label="Status"
                value={filters.status ?? ""}
                onChange={(event) => updateFilter("status", event.target.value)}
                className={CONTROL}
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
              <select
                aria-label="Priority"
                value={filters.priority ?? ""}
                onChange={(event) =>
                  updateFilter("priority", event.target.value)
                }
                className={CONTROL}
              >
                <option value="">All priorities</option>
                <option>Low</option>
                <option>Normal</option>
                <option>High</option>
                <option>Urgent</option>
              </select>
              <select
                aria-label="SLA"
                value={filters.sla ?? ""}
                onChange={(event) => updateFilter("sla", event.target.value)}
                className={CONTROL}
              >
                <option value="">All SLA states</option>
                <option value="on_track">On track</option>
                <option value="due_soon">Due &lt;1h</option>
                <option value="breached">Breached</option>
                <option value="closed">Closed</option>
              </select>
              <button
                type="button"
                aria-expanded={showAdvanced || advancedCount > 0}
                aria-controls="ops-advanced-filters"
                onClick={() => setShowAdvanced((open) => !open)}
                className={`${CONTROL} inline-flex items-center justify-center gap-2 whitespace-nowrap bg-muted`}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                More filters
                {advancedCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
                    {advancedCount}
                  </span>
                )}
              </button>
            </div>

            <div
              id="ops-advanced-filters"
              hidden={!(showAdvanced || advancedCount > 0)}
              className="hf-swap grid grid-cols-1 gap-2.5 rounded-2xl border border-dashed border-border p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
            >
              {workflowEnabled && (
                <>
                  <select
                    aria-label="Risk"
                    value={filters.risk ?? ""}
                    onChange={(event) =>
                      updateFilter("risk", event.target.value)
                    }
                    className={CONTROL}
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
                    className={CONTROL}
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
                    <option value="agent_halted">
                      AI assistant stopped — see escalation reason
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
                    className={CONTROL}
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
                  className={CONTROL}
                >
                  <option value="">All resolutions</option>
                  <option value="ai">Solved by AI</option>
                  <option value="agent">Solved by agent</option>
                  <option value="self_service">Self-service</option>
                  <option value="unresolved">Unresolved</option>
                </select>
              )}
              <Input
                aria-label="Category"
                value={filters.category ?? ""}
                onChange={(event) =>
                  updateFilter("category", event.target.value)
                }
                placeholder="Category"
                className={CONTROL}
              />
              <select
                aria-label="Platform"
                value={filters.platform ?? ""}
                onChange={(event) =>
                  updateFilter("platform", event.target.value)
                }
                className={CONTROL}
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
                className={CONTROL}
              />
              <label className="flex flex-col gap-1 text-[11px] font-bold text-muted-foreground">
                Created from
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
                  className={CONTROL}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-muted-foreground">
                Created to
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
                  className={CONTROL}
                />
              </label>
            </div>
          </div>
          {status === "refreshing" && (
            <div className="relative h-1 overflow-hidden bg-muted">
              <span className="sr-only">Loading operations data…</span>
              <span
                aria-hidden
                className="hf-adm-travel absolute inset-y-0 w-1/4 rounded-full bg-primary"
              />
            </div>
          )}
          {visibleTickets.length === 0 && status !== "refreshing" ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                <Inbox className="h-5 w-5 hf-bob" aria-hidden />
              </span>
              <p className="font-bold text-muted-foreground">
                No tickets match these filters
              </p>
            </div>
          ) : (
            <TicketTable tickets={visibleTickets} now={now} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
            <span className="text-sm font-semibold text-muted-foreground">
              Page {filters.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className={`${CONTROL} w-auto px-4 disabled:opacity-50`}
                disabled={filters.page <= 1}
                onClick={() => updateFilter("page", filters.page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className={`${CONTROL} w-auto px-4 disabled:opacity-50`}
                disabled={filters.page >= totalPages}
                onClick={() => updateFilter("page", filters.page + 1)}
              >
                Next
              </button>
              <select
                aria-label="Page size"
                value={filters.pageSize}
                onChange={(event) =>
                  updateFilter("pageSize", Number(event.target.value))
                }
                className={`${CONTROL} w-auto`}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- Team ---------- */}
      <div
        role="tabpanel"
        id="ops-panel-team"
        aria-labelledby="ops-tab-team"
        hidden={tab !== "team"}
      >
        <section
          tabIndex={0}
          aria-label="Agent workload"
          className="glass hf-rise overflow-x-auto"
        >
          <h2 className="border-b border-border p-5 text-lg font-extrabold">
            Agent workload
          </h2>
          {metrics.agentWorkload.length === 0 ? (
            <p className="p-8 text-center text-sm font-semibold text-muted-foreground">
              No agent activity in this period.
            </p>
          ) : (
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Agent",
                    "Open",
                    "Urgent",
                    "Breached",
                    "Waiting",
                    "Resolved today",
                  ].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-bold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.agentWorkload.map((row, index) => (
                  <tr
                    key={row.agent}
                    className="hf-adm-row border-t border-border transition-colors hover:bg-muted/50"
                    style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5 font-bold">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-extrabold text-secondary-foreground">
                          {(row.agent || "?").charAt(0).toUpperCase()}
                        </span>
                        {row.agent || "Unassigned"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums">
                      {row.open}
                    </td>
                    <td
                      className={`px-4 py-3 tabular-nums ${row.urgent > 0 ? "font-extrabold text-status-danger" : ""}`}
                    >
                      {row.urgent}
                    </td>
                    <td
                      className={`px-4 py-3 tabular-nums ${row.breached > 0 ? "font-extrabold text-status-danger" : ""}`}
                    >
                      {row.breached}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{row.waiting}</td>
                    <td className="px-4 py-3 font-bold tabular-nums text-status-success">
                      {row.resolvedToday}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* ---------- Policy ---------- */}
      {showPolicy && (
        <div
          role="tabpanel"
          id="ops-panel-policy"
          aria-labelledby="ops-tab-policy"
          hidden={tab !== "policy"}
        >
          <Card aria-labelledby="policy-h">
            <h2 id="policy-h" className="text-lg font-extrabold">
              Organization policy
            </h2>
            <label className="mt-4 flex cursor-pointer items-start gap-4 rounded-2xl border border-border p-4 transition-colors hover:bg-muted/50">
              <input
                type="checkbox"
                role="switch"
                checked={policyEnabled}
                onChange={savePolicy}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${
                  policyEnabled ? "bg-primary" : "bg-input"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform ${
                    policyEnabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </span>
              <span>
                <span className="block font-bold">
                  Allow verification exceptions
                </span>
                <span className="block text-sm text-muted-foreground">
                  Lets agents close a ticket when the employee cannot confirm
                  the fix themselves.
                </span>
              </span>
            </label>
          </Card>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Pseudonymous operations data only — no emails, messages, or attachments.
      </p>
    </div>
  );
}
