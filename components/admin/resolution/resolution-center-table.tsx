import Link from "next/link";
import type {
  ResolutionMetrics,
  RunSummary,
} from "@/lib/admin/resolution-center";

const metricLabels: [keyof ResolutionMetrics, string][] = [
  ["aiAssigned", "AI assigned"],
  ["autoResolved", "Auto resolved"],
  ["userAssisted", "User assisted"],
  ["escalated", "Escalated"],
  ["verificationFailures", "Verification failures"],
  ["rollbacks", "Rollbacks"],
  ["reopenRate", "Reopen rate"],
  ["falseResolutionRate", "False-resolution proxy"],
  ["medianTimeToVerifiedMs", "Median time to verified"],
  ["costPerVerifiedCents", "Cost per verified"],
  ["byCapability", "Capabilities tracked"],
];

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
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
}: {
  runs: RunSummary[];
  metrics: ResolutionMetrics;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {metricLabels.map(([key, label]) => (
          <div key={key} className="glass p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">
              {formatMetric(key, metrics[key])}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Run status filters">
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
            className="v2-touch rounded-full border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            {filter}
          </Link>
        ))}
        <Link
          href="/admin/resolution"
          className="v2-touch rounded-full border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          All
        </Link>
        <Link
          href="/admin/resolution/guardrails"
          className="v2-touch rounded-full border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          Guardrails
        </Link>
      </div>
      {runs.length === 0 ? (
        <div className="glass p-8 text-center">
          <h2 className="text-xl font-semibold">No AI-owned runs</h2>
          <p className="mt-2 text-muted-foreground">
            Resolution runs will appear here when autonomy processes a ticket.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="hidden overflow-x-auto rounded-2xl border border-border md:block">
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
                    <th key={heading} className="px-4 py-3 font-medium">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-t border-border">
                    <td className="px-4 py-4">
                      <Link
                        href={`/admin/resolution/${run.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {run.ticketTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-4">{statusLabel(run.status)}</td>
                    <td className="px-4 py-4">
                      {run.plannedCapability ?? "—"}
                    </td>
                    <td className="px-4 py-4">
                      {run.lastPolicyDecision ?? "—"}
                    </td>
                    <td className="px-4 py-4">{run.awaiting ?? "—"}</td>
                    <td className="px-4 py-4">
                      {run.attempts}/{run.maxAttempts}
                    </td>
                    <td className="px-4 py-4">
                      {run.costCents}¢ / {Math.round(run.elapsedMs / 1000)}s
                    </td>
                    <td className="px-4 py-4">{run.reopened ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/admin/resolution/${run.id}`}
                className="glass block space-y-2 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold">{run.ticketTitle}</span>
                  <span className="text-sm text-muted-foreground">
                    {statusLabel(run.status)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {run.plannedCapability ?? "No planned capability"} ·{" "}
                  {run.attempts}/{run.maxAttempts} attempts · {run.costCents}¢
                </p>
                <p className="text-sm">
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
    </div>
  );
}
