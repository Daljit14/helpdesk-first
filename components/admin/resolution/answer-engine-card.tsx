import { BookOpenText, Sparkles } from "lucide-react";
import type { AnswerEngineMetrics } from "@/lib/analytics/answer-engine-metrics";
import { EmptyState, Panel, StatTile } from "@/components/admin/ui/admin-kit";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function AnswerEngineCard({
  metrics,
  enabled,
}: {
  metrics: AnswerEngineMetrics | null;
  enabled: boolean;
}) {
  return (
    <Panel
      id="answer-engine"
      title="Answer engine"
      description="Grounded answer quality and source feedback"
      icon={BookOpenText}
      delay={0.12}
      className="min-w-0"
      actions={
        !enabled ? (
          <span className="rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground">
            Off
          </span>
        ) : null
      }
    >
      {!metrics ? (
        <EmptyState
          icon={BookOpenText}
          title="Not installed"
          body="Answer-engine metrics are not available until the answer-engine migration is installed."
        />
      ) : metrics.runs === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No answer-engine runs yet"
          body={`Metrics will appear here after runs are recorded for the last ${metrics.windowDays} days.`}
        />
      ) : (
        <div className="grid min-w-0 gap-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <StatTile
              label="Answered"
              value={percent(metrics.answerRate)}
              icon={Sparkles}
              tone="good"
              index={0}
              hint={`${metrics.answered} of ${metrics.runs} runs`}
            />
            <StatTile
              label="Cache hits"
              value={percent(metrics.cacheHitRate)}
              icon={BookOpenText}
              tone="info"
              index={1}
              hint={`${metrics.cacheHits} cached runs`}
            />
            <StatTile
              label="p90 latency"
              value={`${Math.round(metrics.p90LatencyMs / 100) / 10}s`}
              icon={Sparkles}
              tone="neutral"
              index={2}
            />
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-border p-4">
              <h3 className="mb-3 font-extrabold">Feedback by top tier</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-3 font-semibold">Tier</th>
                      <th className="pb-2 pr-3 font-semibold">Feedback</th>
                      <th className="pb-2 pr-3 font-semibold">Helpful</th>
                      <th className="pb-2 font-semibold">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.helpfulByTier.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-2 text-muted-foreground">
                          None recorded.
                        </td>
                      </tr>
                    ) : (
                      metrics.helpfulByTier.map((row) => (
                        <tr key={row.tier} className="border-t border-border">
                          <th scope="row" className="py-2 pr-3 font-semibold">
                            {row.tier}
                          </th>
                          <td className="py-2 pr-3">{row.feedback}</td>
                          <td className="py-2 pr-3">{row.helpful}</td>
                          <td className="py-2">{percent(row.rate)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="min-w-0 rounded-2xl border border-border p-4">
              <h3 className="mb-3 font-extrabold">Unanswered labels</h3>
              <ul className="grid gap-2 text-sm">
                {metrics.topUnanswered.length === 0 ? (
                  <li className="text-muted-foreground">None recorded.</li>
                ) : (
                  metrics.topUnanswered.map((item, index) => (
                    <li
                      key={`${item.label}-${index}`}
                      className="flex min-w-0 flex-wrap justify-between gap-2 border-t border-border pt-2 first:border-0 first:pt-0"
                    >
                      <span className="min-w-0 break-words">{item.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.count}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
