"use client";

import {
  Check,
  ClipboardCheck,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { label: "Understanding", icon: Search },
  { label: "Clarifying", icon: MessageCircleQuestion },
  { label: "Likely causes", icon: Lightbulb },
  { label: "Steps", icon: ListChecks },
  { label: "Verify", icon: ClipboardCheck },
];

/**
 * Animated investigation stepper for the Support Assistant.
 * `current` is the index of the active stage (0–4). Earlier stages show a
 * check, the active one pulses, and the track fills smoothly between them.
 */
export function ProgressStepper({ current }: { current: number }) {
  const safe = Math.max(0, Math.min(current, STAGES.length - 1));
  const percent = (safe / (STAGES.length - 1)) * 100;

  return (
    <div className="mb-8 rounded-[24px] border border-border bg-card px-4 py-5 shadow-sm sm:px-6">
      <p className="sr-only">
        Step {safe + 1} of {STAGES.length}: {STAGES[safe].label}
      </p>
      <ol
        aria-label="Investigation progress"
        className="relative grid grid-cols-5"
      >
        {/* Track behind the nodes */}
        <span
          aria-hidden
          className="absolute left-[10%] right-[10%] top-5 h-1 rounded-full bg-muted"
        />
        <span
          aria-hidden
          className="absolute left-[10%] top-5 h-1 origin-left rounded-full bg-[linear-gradient(90deg,var(--primary),#c084fc)] transition-[width] duration-700 ease-out"
          style={{ width: `${percent * 0.8}%` }}
        />
        {STAGES.map(({ label, icon: Icon }, index) => {
          const done = index < safe;
          const active = index === safe;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className="relative flex flex-col items-center gap-2 text-center"
            >
              <span
                className={cn(
                  "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors duration-500",
                  done && "border-primary bg-primary text-primary-foreground",
                  active &&
                    "border-primary bg-card text-primary shadow-[0_8px_18px_-8px_var(--primary)]",
                  !done &&
                    !active &&
                    "border-border bg-card text-muted-foreground"
                )}
              >
                {done ? (
                  <Check className="hf-pop h-5 w-5" aria-hidden />
                ) : (
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                )}
              </span>
              <span
                className={cn(
                  "text-[11px] font-bold leading-tight sm:text-xs",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
