import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Gauge,
  Layers,
  ListChecks,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type {
  ResolutionMetrics,
  RunSummary,
} from "@/lib/admin/resolution-center";
import {
  EmptyState,
  Panel,
  StatusPill,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

const metricLabels: [keyof ResolutionMetrics, string, LucideIcon, StatTone][] =
  [
    ["aiAssigned", "AI assigned", Bot, "primary"],
    ["autoResolved", "Auto resolved", CheckCircle2, "good"],
    ["userAssisted", "User assisted", Activity, "info"],
    ["escalated", "Escalated", AlertTriangle, "warn"],
    ["verificationFailures", "Verification failures", XCircle, "danger"],
    ["rollbacks", "Rollbacks", RotateCcw, "warn"],
    ["reopenRate", "Reopen rate", RefreshCw, "warn"],
    ["falseResolutionRate", "False-resolution proxy", TrendingUp, "danger"],
    ["medianTimeToVerifiedMs", "Median time to verified", Clock, "info"],
    ["costPerVerifiedCents", "Cost per verified", Gauge, "neutral"],
    ["byCapability", "Capabilities tracked", Layers, "primary"],
  ];

const TONE_CHIP: Record<StatTone, string> = {
  primary: "bg-secondary text-secondary-foreground",
  good: "bg-status-success/15 text-status-success",
  warn: "bg-status-warning/15 text-status-warning",
  danger: "bg-status-danger/15 text-status-danger",
  info: "bg-status-info/15 text-status-info",
  neutral: "bg-muted text-muted-foreground",
};

const PILL =
  "v2-touch inline-flex items-center rounded-full border border-border bg-card px-3.5 py-2 text-sm font-bold text-foreground transition-colors hover:border-primary/40 hover:bg-muted/60";

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

/** Colour for a run stage pill. */
export function runStatusTone(status: string): StatTone {
  if (status === "resolved") return "good";
  if (status === "escalated" || status === "failed") return "danger";
  if (status === "paused") return "neutral";
  if (status === "awaiting_consent" || status === "awaiting_approval")
    return "warn";
  if (status === "verifying") return "info";
  return "primary";
}

function isActive(status: string): boolean {
  return [
    "queued",
    "investigating",
    "planning",
    "policy_check",
    "executing",
    "verifying",
  ].includes(status);
}

function formatMetric(
  key: keyof ResolutionMetrics,
  value: number | ResolutionMetrics["byCapability"]
): string {
  if (key === "byCapability")
    return String((value as ResolutionMetrics["byCapability"]).length);
  if (typeof value !== "number") return "—";
  if (key === "reopenRate" || key === "falseResolutionRate")
    return `${Math.round(value * 100)}%`;
  if (key === "medianTimeToVerifiedMs") return `${Math.round(value / 1000)}s`;
  if (key === "costPerVerifiedCents") return `${value.toFixed(1)}¢`;
  return String(value);
}

export function ResolutionCenterTable({
  runs,
  metrics,
  showExcluded,
}: {
  runs: RunSummary[];
  metrics: ResolutionMetrics;
  showExcluded?: boolean;
}) {
  return (
    <div className="space-y-5">
      <Panel
        title="Resolution metrics"
        description="Outcomes for AI-owned resolution runs"
        icon={Gauge}
        delay={0.15}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {metricLabels.map(([key, label, Icon, tone], index) => (
            <div
              key={key}
              className="hf-adm-card hf-rise flex flex-col gap-1.5 rounded-2xl border border-border bg-card/60 p-3.5"
              style={{ animationDelay: `${0.15 + index * 0.03}s` }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-muted-foreground">
                  {label}
                </p>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONE_CHIP[tone]}`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
              </div>
              <p className="text-2xl font-extrabold tracking-tight tabular-nums">
                {formatMetric(key, metrics[key])}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Runs"
        description={`${runs.length} ${runs.length === 1 ? "run" : "runs"} in this view`}
        icon={ListChecks}
        delay={0.2}
        flush
      >
        <div
          className="flex flex-wrap gap-2 px-5 pt-4 sm:px-6"
          aria-label="Run status filters"
        >
          {[
            "Active",
            "Awaiting",
            "Verifying",
            "Resolved",
            "Escalated",
            "Failed",
            "Paused",
          ].map((filter) => (
            <Link
              key={filter}
              href={`/admin/resolution?status=${filter.toLowerCase()}`}
              className={PILL}
            >
              {filter}
            </Link>
          ))}
          <Link href="/admin/resolution" className={PILL}>
            All
          </Link>
          <Link
            href={
              showExcluded
                ? "/admin/resolution"
                : "/admin/resolution?showExcluded=1"
            }
            className={PILL}
          >
            {showExcluded ? "Hide excluded" : "Show excluded"}
          </Link>
        </div>
        {runs.length === 0 ? (
          <EmptyState
            icon={Bot}
            title="No AI-owned runs"
            body="Resolution runs will appear here when autonomy processes a ticket."
          />
        ) : (
          <div className="space-y-3 pt-4">
            <div className="hidden overflow-x-auto border-t border-border md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      "Ticket",
                      "Stage",
                      "Capability",
                      "Policy",
                      "Awaiting",
                      "Attempts",
                      "Cost / elapsed",
                      "Reopened",
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-extrabold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-t border-border">
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/admin/resolution/${run.id}`}
                          className="font-extrabold text-foreground underline-offset-4 hover:text-primary hover:underline"
                        >
                          {run.ticketTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusPill
                          tone={runStatusTone(run.status)}
                          pulse={isActive(run.status)}
                        >
                          <span className="capitalize">
                            {statusLabel(run.status)}
                          </span>
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs">
                        {run.plannedCapability ?? "—"}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {run.lastPolicyDecision ?? "—"}
                      </td>
                      <td className="px-4 py-3.5">{run.awaiting ?? "—"}</td>
                      <td className="px-4 py-3.5 tabular-nums">
                        <span className="inline-flex items-center gap-2">
                          {run.attempts}/{run.maxAttempts}
                          <span
                            aria-hidden
                            className="block h-1.5 w-12 overflow-hidden rounded-full bg-muted"
                          >
                            <span
                              className="hf-adm-grow hf-adm-bar block h-full rounded-full"
                              style={{
                                width: `${Math.min(100, (run.attempts / Math.max(1, run.maxAttempts)) * 100)}%`,
                              }}
                            />
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-muted-foreground">
                        {run.costCents}¢ / {Math.round(run.elapsedMs / 1000)}s
                      </td>
                      <td className="px-4 py-3.5">
                        {run.reopened ? (
                          <StatusPill tone="warn">Yes</StatusPill>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 px-4 pb-4 md:hidden">
              {runs.map((run) => (
                <Link
                  key={run.id}
                  href={`/admin/resolution/${run.id}`}
                  className="hf-adm-card block space-y-2 rounded-2xl border border-border bg-card/60 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-extrabold">{run.ticketTitle}</span>
                    <StatusPill tone={runStatusTone(run.status)}>
                      <span className="capitalize">
                        {statusLabel(run.status)}
                      </span>
                    </StatusPill>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {run.plannedCapability ?? "No planned capability"} ·{" "}
                    {run.attempts}/{run.maxAttempts} attempts · {run.costCents}¢
                  </p>
                  <p className="text-sm font-semibold">
                    {run.awaiting
                      ? `Awaiting ${run.awaiting}`
                      : "No pending approval"}
                    {run.reopened ? " · Reopened" : ""}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
