import Link from "next/link";
import { ArrowLeftRight, Repeat, Route } from "lucide-react";
import type { RouteMetrics } from "@/lib/analytics/route-metrics";
import { formatHandoffReason } from "@/lib/tickets/routing";
import { EmptyState, Panel, StatTile } from "@/components/admin/ui/admin-kit";

const MAX_CASES = 10;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function RouteMetricsCard({
  metrics,
}: {
  metrics: RouteMetrics | null;
}) {
  return (
    <Panel
      id="ticket-routing"
      title="Ticket routing"
      description="How often staff hand tickets on after triage"
      icon={Route}
      delay={0.14}
      className="min-w-0"
    >
      {!metrics ? (
        <EmptyState
          icon={Route}
          title="Not installed"
          body="Routing metrics are not available until the ticket route events migration is installed."
        />
      ) : metrics.stats.routedTickets === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No routing changes yet"
          body={`Claims and reassignments from the last ${metrics.windowDays} days will appear here.`}
        />
      ) : (
        <div className="grid min-w-0 gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatTile
              label="Reroute rate"
              value={percent(metrics.stats.rerouteRate)}
              icon={ArrowLeftRight}
              tone={metrics.stats.rerouteRate > 0.2 ? "warn" : "good"}
              index={0}
              hint={`${metrics.stats.reroutedTickets} of ${metrics.stats.routedTickets} tickets changed owner`}
            />
            <StatTile
              label="Ping-pong tickets"
              value={metrics.stats.pingPongTicketIds.length}
              icon={Repeat}
              tone={
                metrics.stats.pingPongTicketIds.length > 0 ? "danger" : "good"
              }
              index={1}
              hint="Reassigned 3 or more times"
            />
          </div>
          {metrics.reviewCases.length > 0 && (
            <div className="min-w-0 rounded-2xl border border-border p-4">
              <h3 className="font-extrabold">Triage review cases</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Rerouted tickets to turn into triage test cases.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-3 font-semibold">Ticket</th>
                      <th className="pb-2 pr-3 font-semibold">Reroutes</th>
                      <th className="pb-2 pr-3 font-semibold">Category</th>
                      <th className="pb-2 pr-3 font-semibold">Triage result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.reviewCases.slice(0, MAX_CASES).map((item) => (
                      <tr
                        key={item.ticketId}
                        className="border-t border-border"
                      >
                        <td className="py-2 pr-3 font-mono">
                          <Link
                            href={`/admin/tickets/${item.ticketId}`}
                            className="font-bold underline-offset-2 hover:underline"
                          >
                            {item.ticketId.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {item.reroutes}
                          {item.pingPong && (
                            <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 font-bold text-destructive">
                              Ping-pong
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{item.category ?? "—"}</td>
                        <td className="py-2 pr-3">
                          {item.aiRecommendedIssueId
                            ? `Guide: ${item.aiRecommendedIssueId}`
                            : (formatHandoffReason(item.handoffReason) ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
