import { MessageSquareText } from "lucide-react";
import type { AutonomyMetrics } from "@/lib/analytics/autonomy-metrics";
import { EmptyState, Panel } from "@/components/admin/ui/admin-kit";

const VERDICT_LABELS: Record<string, string> = {
  still_broken: "Still broken",
  came_back: "Came back",
  wrong_problem: "Misunderstood the problem",
  other: "Other",
};

export function OutcomeFeedbackPanel({
  items,
  total,
}: {
  items: AutonomyMetrics["recentFeedback"];
  total: number;
}) {
  return (
    <Panel
      title="Requester feedback"
      description="Sessions the requester said weren't fixed"
      icon={MessageSquareText}
      actions={
        <span className="text-sm font-semibold text-muted-foreground">
          {total} session{total === 1 ? "" : "s"}
        </span>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No requester feedback yet"
          body="Feedback will appear here when a requester reports that a resolved session was not fixed."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={`${item.sessionId}-${item.createdAt}`}
              className="rounded-2xl border border-border bg-muted/30 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-extrabold">
                  {VERDICT_LABELS[item.verdict] ?? "Other"}
                </p>
                <time
                  className="text-xs font-semibold text-muted-foreground"
                  dateTime={item.createdAt}
                >
                  {item.createdAt}
                </time>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Session {item.sessionId.slice(0, 8)}
              </p>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm">
                {item.text || "No comment"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
