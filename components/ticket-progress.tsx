import { progressStage } from "@/lib/tickets/user-status";

const stages = [
  "Submitted",
  "Reviewing",
  "Working on it",
  "Waiting for you",
  "Confirm fix",
  "Resolved",
] as const;

export function TicketProgress({
  status,
  description,
  assignment,
}: {
  status: string;
  description: string;
  assignment: {
    label: string;
    expectedResponseBy: string | null;
    lastUpdated: string | null;
  };
}) {
  const currentStage = progressStage(status);

  return (
    <section id="progress" className="glass mt-6 p-5">
      <h2 className="font-semibold">Ticket progress</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stages.map((stage, index) => {
          const complete = index < currentStage;
          const current = index === currentStage;
          return (
            <li
              key={stage}
              className={`rounded-2xl border p-3 text-sm ${
                complete
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : current
                    ? "border-primary bg-primary/15 text-foreground ring-1 ring-primary"
                    : "border-border/60 text-muted-foreground"
              }`}
              aria-current={current ? "step" : undefined}
            >
              <span className="font-medium">
                {index + 1}. {stage}
              </span>
              {current && description && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {description}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-4 space-y-1 text-sm text-muted-foreground">
        <p>Who&apos;s on it: {assignment.label}</p>
        {assignment.expectedResponseBy && (
          <p>{assignment.expectedResponseBy}</p>
        )}
        {assignment.lastUpdated && <p>{assignment.lastUpdated}</p>}
      </div>
    </section>
  );
}
