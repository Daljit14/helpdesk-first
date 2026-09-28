import type { AutonomyMetrics } from "@/lib/analytics/autonomy-metrics";

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
  ["sessions", "Sessions"],
  ["aiResolved", "AI resolved"],
  ["aiResolutionRate", "AI resolution rate"],
  ["falseResolved", "False resolved"],
  ["escalated", "Escalated"],
  ["escalationRate", "Escalation rate"],
] as const;

export function AutonomyMetricsCard({ metrics }: { metrics: AutonomyMetrics }) {
  if (metrics.sessions === 0) {
    return (
      <section className="glass p-6" aria-labelledby="autonomy-metrics-title">
        <h2 id="autonomy-metrics-title" className="text-xl font-semibold">
          Requester-agent outcome metrics
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Outcome metrics will appear here after requester-agent sessions are
          recorded for this organization.
        </p>
      </section>
    );
  }

  return (
    <section
      className="glass space-y-6 p-6"
      aria-labelledby="autonomy-metrics-title"
    >
      <div>
        <p className="text-sm text-muted-foreground">
          Last {metrics.window.windowDays} days
        </p>
        <h2 id="autonomy-metrics-title" className="mt-1 text-xl font-semibold">
          Requester-agent outcome metrics
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {headlineLabels.map(([key, label]) => {
          const value =
            key === "aiResolutionRate" || key === "escalationRate"
              ? percent(metrics[key])
              : String(metrics[key]);
          return (
            <div key={key} className="rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          );
        })}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="font-medium">Escalation reasons</h3>
          {metrics.escalationReasons.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {metrics.escalationReasons.map((reason) => (
                <li className="flex justify-between gap-4" key={reason.reason}>
                  <span>{reason.reason}</span>
                  <span className="font-medium">{reason.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="font-medium">Unhandled intents</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {metrics.unhandledIntentCount} intent
            {metrics.unhandledIntentCount === 1 ? "" : "s"} without a guide
            match.
          </p>
          {metrics.unhandledIntents.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">
              {metrics.unhandledIntents.map((intent) => (
                <li
                  className="rounded-lg border border-border p-3"
                  key={intent.sessionId}
                >
                  <p>{intent.query || "No message recorded."}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {intent.startedAt}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span>
          Median AI resolution: {duration(metrics.medianAiResolutionMs)}
        </span>
        <span>
          Median human resolution: {duration(metrics.medianHumanResolutionMs)}
        </span>
      </div>
    </section>
  );
}
