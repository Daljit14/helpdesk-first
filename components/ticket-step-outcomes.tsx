"use client";

import { useState, useTransition } from "react";
import { recordStepOutcome } from "@/app/actions/tickets";

type Outcome = "worked" | "failed" | "could_not_perform";

export function TicketStepOutcomes({
  ticketId,
  guideSlug,
  guideTitle,
  guideUrl,
  steps,
  outcomes,
}: {
  ticketId: string;
  guideSlug: string;
  guideTitle: string;
  guideUrl: string;
  steps: string[];
  outcomes: Record<number, Outcome>;
}) {
  const [current, setCurrent] = useState(outcomes);
  const [pending, startTransition] = useTransition();
  const choose = (stepIndex: number, outcome: Outcome) => {
    startTransition(async () => {
      const result = await recordStepOutcome(
        ticketId,
        guideSlug,
        stepIndex,
        outcome
      );
      if ("error" in result) return;
      setCurrent((value) => ({ ...value, [stepIndex]: outcome }));
    });
  };
  return (
    <section className="glass p-5">
      <h2 className="font-semibold">
        Approved guide:{" "}
        <a
          href={guideUrl}
          className="underline underline-offset-4"
          target="_blank"
          rel="noreferrer"
        >
          {guideTitle}
        </a>
      </h2>
      <ol className="mt-4 space-y-4">
        {steps.map((step, index) => (
          <li
            key={`${guideSlug}-${index}`}
            className="rounded-2xl bg-muted/40 p-4"
          >
            <p className="font-medium">
              Step {index + 1}: {step}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["worked", "Worked"],
                  ["failed", "Didn't work"],
                  ["could_not_perform", "Couldn't do this"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={pending}
                  onClick={() => choose(index, value)}
                  className={`glass-pill px-3 py-2 text-sm ${
                    current[index] === value ? "ring-2 ring-primary" : ""
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
