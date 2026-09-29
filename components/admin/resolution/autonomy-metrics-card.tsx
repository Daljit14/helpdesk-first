import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Lightbulb,
  TrendingUp,
  XCircle,
} from "lucide-react";
import type { AutonomyMetrics } from "@/lib/analytics/autonomy-metrics";
import {
  BarRows,
  EmptyState,
  Panel,
  StatTile,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function duration(value: number): string {
  if (value === 0) return "—";
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

const headlineLabels = [
  ["sessions", "Sessions", Activity, "primary"],
  ["aiResolved", "AI resolved", CheckCircle2, "good"],
  ["aiResolutionRate", "AI resolution rate", TrendingUp, "good"],
  ["falseResolved", "False resolved", XCircle, "danger"],
  ["escalated", "Escalated", AlertTriangle, "warn"],
  ["escalationRate", "Escalation rate", TrendingUp, "warn"],
] as const;

export function AutonomyMetricsCard({ metrics }: { metrics: AutonomyMetrics }) {
  if (metrics.sessions === 0) {
    return (
      <Panel
        id="autonomy-metrics"
        title="Requester-agent outcome metrics"
        icon={Bot}
        delay={0.1}
      >
        <EmptyState
          icon={Bot}
          title="No sessions yet"
          body="Outcome metrics will appear here after requester-agent sessions are recorded for this organization."
        />
      </Panel>
    );
  }

  return (
    <Panel
      id="autonomy-metrics"
      title="Requester-agent outcome metrics"
      description={`Last ${metrics.window.windowDays} days`}
      icon={Bot}
      delay={0.1}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {headlineLabels.map(([key, label, icon, tone], index) => {
          const isRate = key === "aiResolutionRate" || key === "escalationRate";
          const value = isRate ? percent(metrics[key]) : String(metrics[key]);
          return (
            <StatTile
              key={key}
              label={label}
              value={value}
              icon={icon}
              tone={tone as StatTone}
              index={index}
              progress={isRate ? metrics[key] : undefined}
            />
          );
        })}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-border p-4">
          <h3 className="mb-3 flex items-center gap-2 font-extrabold">
            <AlertTriangle
              className="h-4 w-4 text-status-warning"
              aria-hidden
            />
            Escalation reasons
          </h3>
          {metrics.escalationReasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <BarRows
              tone="warn"
              items={metrics.escalationReasons.map((reason) => ({
                key: reason.reason,
                count: reason.count,
              }))}
            />
          )}
        </div>
        <div className="rounded-2xl border border-border p-4">
          <h3 className="flex items-center gap-2 font-extrabold">
            <Lightbulb className="h-4 w-4 text-status-info" aria-hidden />
            Unhandled intents
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {metrics.unhandledIntentCount} intent
            {metrics.unhandledIntentCount === 1 ? "" : "s"} without a guide
            match.
          </p>
          {metrics.unhandledIntents.length > 0 && (
            <ul className="mt-3 max-h-72 space-y-2 overflow-auto text-sm">
              {metrics.unhandledIntents.map((intent, index) => (
                <li
                  className="hf-adm-row rounded-xl border border-border bg-muted/30 p-3"
                  style={{ animationDelay: `${Math.min(index, 12) * 0.04}s` }}
                  key={intent.sessionId}
                >
                  <p className="font-semibold">
                    {intent.query || "No message recorded."}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {intent.startedAt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success/15 px-3 py-1.5 text-status-success">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          <span>
            Median AI resolution: {duration(metrics.medianAiResolutionMs)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          <span>
            Median human resolution: {duration(metrics.medianHumanResolutionMs)}
          </span>
        </span>
      </div>
    </Panel>
  );
}
