import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Coins,
  DollarSign,
  Lightbulb,
  XCircle,
} from "lucide-react";
import type {
  AutonomyMetrics,
  HonestBreakdown,
} from "@/lib/analytics/autonomy-metrics";
import {
  BarRows,
  EmptyState,
  Panel,
  StatTile,
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

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: HonestBreakdown[];
}) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <h3 className="mb-3 font-extrabold">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-2 pr-3 font-semibold">Key</th>
              <th className="pb-2 pr-3 font-semibold">Sessions</th>
              <th className="pb-2 pr-3 font-semibold">AI resolved</th>
              <th className="pb-2 pr-3 font-semibold">False resolved</th>
              <th className="pb-2 font-semibold">Abandoned</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-2 text-muted-foreground">
                  None recorded.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <th scope="row" className="py-2 pr-3 font-semibold">
                    {row.key}
                  </th>
                  <td className="py-2 pr-3">{row.sessions}</td>
                  <td className="py-2 pr-3">{row.aiResolved}</td>
                  <td className="py-2 pr-3">{row.falseResolved}</td>
                  <td className="py-2">{row.abandoned}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AutonomyMetricsCard({ metrics }: { metrics: AutonomyMetrics }) {
  return (
    <Panel
      id="autonomy-metrics"
      title="Requester-agent outcome metrics"
      description={`Last ${metrics.window.windowDays} days · Metrics v2`}
      icon={Bot}
      delay={0.1}
    >
      {metrics.sessions === 0 && (
        <EmptyState
          icon={Bot}
          title="No sessions yet"
          body="Outcome metrics will appear here after requester-agent sessions are recorded for this organization."
        />
      )}
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="AI resolved"
            value={percent(metrics.v2.aiResolutionRate)}
            icon={CheckCircle2}
            tone="good"
            index={0}
            progress={metrics.v2.aiResolutionRate}
            hint={`${metrics.v2.aiResolved} sessions`}
          />
          <StatTile
            label="False resolved"
            value={percent(metrics.v2.falseResolvedRate)}
            icon={XCircle}
            tone="danger"
            index={1}
            progress={metrics.v2.falseResolvedRate}
            hint={`${metrics.v2.falseResolved} sessions`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Deflection"
            value={percent(metrics.v2.deflectionRate)}
            icon={Activity}
            tone="good"
            index={2}
            progress={metrics.v2.deflectionRate}
            hint={`${metrics.v2.deflected} sessions`}
          />
          <StatTile
            label="Abandonment"
            value={percent(metrics.v2.abandonmentRate)}
            icon={AlertTriangle}
            tone="warn"
            index={3}
            progress={metrics.v2.abandonmentRate}
            hint={`${metrics.v2.abandoned} sessions`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Median time to resolve"
            value={duration(metrics.v2.medianResolveMs)}
            icon={Clock}
            tone="neutral"
            index={4}
          />
          <StatTile
            label="p90 time to resolve"
            value={duration(metrics.v2.p90ResolveMs)}
            icon={Clock}
            tone="neutral"
            index={5}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Sessions"
            value={String(metrics.v2.sessions)}
            icon={Bot}
            tone="primary"
            index={6}
          />
          <StatTile
            label="Pending (72 h)"
            value={String(metrics.v2.pending)}
            icon={Clock}
            tone="warn"
            index={7}
          />
          <StatTile
            label="Hidden staff touch"
            value={String(metrics.v2.hiddenStaffTouch)}
            icon={AlertTriangle}
            tone="warn"
            index={8}
          />
          <StatTile
            label="Repeat-issue rate (30 d)"
            value={percent(metrics.v2.repeatIssueRate)}
            icon={Activity}
            tone="info"
            index={9}
            hint={`${metrics.v2.repeatIssues} repeat issues`}
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Metrics v1 (comparison): AI resolution rate{" "}
        {percent(metrics.aiResolutionRate)}
      </p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <BreakdownTable title="By category" rows={metrics.v2.byCategory} />
        <BreakdownTable title="By capability" rows={metrics.v2.byCapability} />
      </div>
      {metrics.orgEnvironment && (
        <div className="mt-3 max-w-sm">
          <StatTile
            label="Avg clarifying questions"
            value={metrics.avgClarifyingQuestions?.toFixed(1) ?? "—"}
            icon={Lightbulb}
            tone="info"
            index={10}
            hint={`${metrics.clarifiedTickets} tickets`}
          />
        </div>
      )}
      {metrics.costTracking && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <StatTile
            label="Cost per AI resolution"
            value={
              metrics.costPerAiResolutionMicros === null
                ? "—"
                : `$${(metrics.costPerAiResolutionMicros / 1_000_000).toFixed(4)}`
            }
            icon={DollarSign}
            tone="neutral"
            index={11}
          />
          <StatTile
            label="AI spend (window)"
            value={`$${(metrics.totalCostMicros / 1_000_000).toFixed(2)}`}
            icon={Coins}
            tone="neutral"
            index={12}
          />
        </div>
      )}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-border p-4">
          <h3 className="mb-3 flex items-center gap-2 font-extrabold">
            <AlertTriangle
              className="h-4 w-4 text-status-warning"
              aria-hidden
            />
            Escalation reasons
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Replies redacted:{" "}
            <span className="font-semibold text-foreground">
              {metrics.replyRedactedSessions} session
              {metrics.replyRedactedSessions === 1 ? "" : "s"}
            </span>
          </p>
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
    </Panel>
  );
}
