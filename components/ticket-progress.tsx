import { progressStage } from "@/lib/tickets/user-status";
import { Check } from "lucide-react";

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
    <section id="progress" className="glass mt-6 scroll-mt-24 p-5">
      <h2 className="font-semibold">Ticket progress</h2>
      <ol className="mt-6 flex flex-col gap-4 sm:flex-row sm:gap-0">
        {stages.map((stage, index) => {
          const complete = index < currentStage;
          const current = index === currentStage;
          return (
            <li
              key={stage}
              className="relative flex min-w-0 flex-1 items-start gap-3 sm:flex-col sm:items-center"
              aria-current={current ? "step" : undefined}
            >
              {index < stages.length - 1 && (
                <span className="absolute left-4 top-8 h-[calc(100%+1rem)] w-px bg-border sm:left-1/2 sm:top-4 sm:h-px sm:w-full" />
              )}
              <span
                className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  complete
                    ? "bg-primary text-primary-foreground"
                    : current
                      ? "border border-primary text-foreground ring-2 ring-primary"
                      : "border border-border text-muted-foreground"
                }`}
              >
                {complete ? (
                  <Check className="h-4 w-4" />
                ) : current ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                ) : (
                  index + 1
                )}
              </span>
              <span className="z-10 pt-1 text-xs font-medium sm:pt-2 sm:text-center">
                {stage}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 rounded-xl bg-primary/10 p-4 text-sm">
        <p className="font-medium">Who&apos;s on it: {assignment.label}</p>
        {description && (
          <p className="mt-1 text-muted-foreground">{description}</p>
        )}
        {assignment.lastUpdated && (
          <p className="mt-2 text-xs text-muted-foreground">
            Last updated: {assignment.lastUpdated}
          </p>
        )}
      </div>
    </section>
  );
}
