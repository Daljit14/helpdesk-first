import { ISSUES } from "@/lib/issues";
import type {
  InvestigationRow,
  InvestigationTurnRow,
} from "@/lib/investigation/types";

export function TicketInvestigation({
  investigation,
  turns,
}: {
  investigation: InvestigationRow;
  turns: InvestigationTurnRow[];
}) {
  return (
    <section
      className="glass-strong mt-6 space-y-5 p-5"
      aria-label="Investigation"
    >
      <div>
        <h2 className="text-lg font-semibold">Investigation</h2>
        <p className="text-sm text-muted-foreground">{investigation.status}</p>
      </div>
      {investigation.hypotheses.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium">Likely causes</h3>
          {investigation.hypotheses.map((hypothesis, index) => {
            const confidence = Math.max(0, Math.min(1, hypothesis.confidence));
            return (
              <div key={`${String(hypothesis.cause)}-${index}`}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{hypothesis.cause}</span>
                  <span>{Math.round(confidence * 100)}%</span>
                </div>
                <div
                  className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={Math.round(confidence * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round(confidence * 100)}%` }}
                  />
                </div>
                {hypothesis.evidence.length > 0 && (
                  <details className="mt-2 text-sm text-muted-foreground">
                    <summary className="cursor-pointer">Why</summary>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {hypothesis.evidence.map((item) => (
                        <li key={item}>“{item}”</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
      {turns.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Turn history</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {turns.map((turn, index) => (
              <li
                key={String(turn.id ?? index)}
                className="flex flex-wrap gap-x-2"
              >
                <span>{new Date(turn.created_at).toLocaleString()}</span>
                <span>{turn.decision}</span>
                {turn.confidence !== null && (
                  <span>{Math.round(turn.confidence * 100)}%</span>
                )}
                {turn.matched_issue_slug && (
                  <span>
                    {ISSUES.find(
                      (issue) => issue.id === turn.matched_issue_slug
                    )?.title ?? turn.matched_issue_slug}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
