import { ISSUES } from "@/lib/issues";

type InvestigationHypothesis = {
  cause?: unknown;
  confidence?: unknown;
  evidence?: unknown;
};

type InvestigationTurn = {
  id?: unknown;
  decision?: unknown;
  confidence?: unknown;
  matched_issue_slug?: unknown;
  created_at?: unknown;
};

export function TicketInvestigation({
  investigation,
  turns,
}: {
  investigation: unknown;
  turns: unknown[];
}) {
  if (!investigation || typeof investigation !== "object") return null;
  const value = investigation as {
    hypotheses?: unknown;
    status?: unknown;
  };
  const hypotheses = Array.isArray(value.hypotheses)
    ? (value.hypotheses as InvestigationHypothesis[])
    : [];
  const history = turns.filter(
    (turn): turn is InvestigationTurn =>
      Boolean(turn) && typeof turn === "object"
  );
  return (
    <section
      className="glass-strong mt-6 space-y-5 p-5"
      aria-label="Investigation"
    >
      <div>
        <h2 className="text-lg font-semibold">Investigation</h2>
        {typeof value.status === "string" && (
          <p className="text-sm text-muted-foreground">{value.status}</p>
        )}
      </div>
      {hypotheses.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium">Likely causes</h3>
          {hypotheses.map((hypothesis, index) => {
            const confidence =
              typeof hypothesis.confidence === "number"
                ? Math.max(0, Math.min(1, hypothesis.confidence))
                : 0;
            const evidence = Array.isArray(hypothesis.evidence)
              ? hypothesis.evidence.filter(
                  (item): item is string => typeof item === "string"
                )
              : [];
            return (
              <div key={`${String(hypothesis.cause)}-${index}`}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{String(hypothesis.cause ?? "Unknown cause")}</span>
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
                {evidence.length > 0 && (
                  <details className="mt-2 text-sm text-muted-foreground">
                    <summary className="cursor-pointer">Why</summary>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {evidence.map((item) => (
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
      {history.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium">Turn history</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {history.map((turn, index) => (
              <li
                key={String(turn.id ?? index)}
                className="flex flex-wrap gap-x-2"
              >
                <span>
                  {typeof turn.created_at === "string"
                    ? new Date(turn.created_at).toLocaleString()
                    : "Unknown time"}
                </span>
                <span>{String(turn.decision ?? "unknown")}</span>
                {typeof turn.confidence === "number" && (
                  <span>{Math.round(turn.confidence * 100)}%</span>
                )}
                {typeof turn.matched_issue_slug === "string" && (
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
