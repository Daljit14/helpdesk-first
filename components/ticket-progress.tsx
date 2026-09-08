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
      <ol className="mt-6 flex flex-col gap-4 min-[640px]:flex-row min-[640px]:gap-0">
        {stages.map((stage, index) => {
          const complete = index < currentStage;
          const current = index === currentStage;
          return (
            <li
              key={stage}
              className="relative flex min-w-0 flex-1 items-start gap-3 min-[640px]:flex-col min-[640px]:items-center"
              aria-current={current ? "step" : undefined}
            >
              {index < stages.length - 1 && (
                <span className="absolute left-4 top-8 h-[calc(100%+1rem)] w-px bg-border min-[640px]:left-1/2 min-[640px]:top-4 min-[640px]:h-px min-[640px]:w-full" />
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
              <span className="z-10 pt-1 text-xs font-medium min-[640px]:pt-2 min-[640px]:text-center">
                {stage}
              </span>
            </li>
          );
        })}
      </ol>
      {description && (
        <div className="mt-5 rounded-xl bg-primary/10 p-4 text-sm">
          <p className="font-medium">Who&apos;s on it: {assignment.label}</p>
          <p className="mt-1 text-muted-foreground">{description}</p>
          {assignment.lastUpdated && (
            <p className="mt-2 text-xs text-muted-foreground">
              Last updated: {assignment.lastUpdated}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
