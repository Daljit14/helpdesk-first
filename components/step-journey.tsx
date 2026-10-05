"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  Battery,
  Bot,
  Camera,
  Check,
  Clock,
  Download,
  Globe,
  HardDrive,
  Headset,
  KeyRound,
  Keyboard,
  Mail,
  Mic,
  Monitor,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Volume2,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Issue } from "@/lib/issues";
import { getIssueSteps } from "@/lib/steps";
import { getSession, saveSession } from "@/lib/session";
import type { StepOutcome, TroubleshootingSession } from "@/lib/session";

/* ------------------------------------------------------------------ */
/* Shared helpers for the animated "journey" step timeline.            */
/* Used by the guide wizard (troubleshooting-guide.tsx) and by the     */
/* issue page's step preview (StepJourneyPreview below).               */
/* ------------------------------------------------------------------ */

const ICON_RULES: [RegExp, LucideIcon][] = [
  [
    /\b(restart|reboot|power (?:it )?off|turn (?:it )?off|power cycle|unplug)/i,
    RefreshCw,
  ],
  [
    /\b(antivirus|anti-virus|virus|malware|scan|phish|suspicious|security)/i,
    ShieldCheck,
  ],
  [
    /\b(password|passcode|sign(?:ing)? (?:in|out)|log ?in|credential|mfa|two-factor|authenticator|account)/i,
    KeyRound,
  ],
  [
    /\b(storage|disk|drive|free (?:up )?space|recycle bin|trash|delete|files?\b|folder)/i,
    HardDrive,
  ],
  [/\b(wi-?fi|network|internet|router|ethernet|vpn|connection|connect)/i, Wifi],
  [/\b(update|upgrade|install|download|driver|patch)/i, Download],
  [/\b(sound|audio|volume|speaker|headphone|headset|mute)/i, Volume2],
  [/\b(microphone|mic)\b/i, Mic],
  [/\b(camera|webcam|video)/i, Camera],
  [/\b(print|printer|toner|paper)/i, Printer],
  [/\b(e-?mail|outlook|inbox|mailbox)/i, Mail],
  [/\b(battery|charg)/i, Battery],
  [/\b(keyboard|mouse|trackpad)/i, Keyboard],
  [/\b(screen|display|monitor|brightness)/i, Monitor],
  [/\b(browser|cache|cookie|website|chrome|edge|safari|firefox)/i, Globe],
  [/\b(phone|mobile|tablet)/i, Smartphone],
  [
    /\b(contact it|it team|help ?desk|support|report|ask it|escalate)/i,
    Headset,
  ],
  [/\b(settings?|preferences|control panel)/i, Settings],
  [/\b(check|verify|confirm|look|search|find)/i, Search],
];

export function stepIconFor(text: string): LucideIcon {
  for (const [pattern, icon] of ICON_RULES) {
    if (pattern.test(text)) return icon;
  }
  return Wrench;
}

/** Rough per-step minutes from an issue's total time ("20 min"). */
export function stepMinutes(
  totalTime: string | undefined,
  count: number
): number | null {
  if (!totalTime || count <= 0) return null;
  const match = /(\d+)\s*min/i.exec(totalTime);
  if (!match) return null;
  return Math.max(1, Math.round(Number(match[1]) / count));
}

export type JourneyStepState =
  "done" | "failed" | "blocked" | "skipped" | "current" | "upcoming";

export function deriveStepStates({
  indexes,
  steps,
  currentIndex,
  attempted,
  completed,
  finished,
}: {
  indexes: number[];
  steps: string[];
  currentIndex: number;
  attempted: { step: string; outcome: StepOutcome }[];
  completed: number[];
  finished: boolean;
}): Map<number, JourneyStepState> {
  const result = new Map<number, JourneyStepState>();
  let currentPos = indexes.indexOf(currentIndex);
  if (
    currentPos < 0 &&
    indexes.length > 0 &&
    currentIndex > indexes[indexes.length - 1]
  ) {
    currentPos = indexes.length;
  }
  indexes.forEach((index, position) => {
    const text = steps[index];
    let last: StepOutcome | undefined;
    for (const attempt of attempted) {
      if (attempt.step === text) last = attempt.outcome;
    }
    if (completed.includes(index) || last === "completed") {
      result.set(index, "done");
    } else if (last === "did-not-work") {
      result.set(index, "failed");
    } else if (last === "cannot-complete") {
      result.set(index, "blocked");
    } else if (!finished && index === currentIndex) {
      result.set(index, "current");
    } else if (currentPos >= 0 && position < currentPos) {
      result.set(index, "skipped");
    } else {
      result.set(index, "upcoming");
    }
  });
  return result;
}

export function stateChipLabel(state: JourneyStepState): string | null {
  switch (state) {
    case "done":
      return "Done";
    case "failed":
      return "No change";
    case "blocked":
      return "Couldn't do";
    case "skipped":
      return "Skipped";
    case "current":
      return "You are here";
    default:
      return null;
  }
}

/** Animated SVG checkmark (stroke draw). */
export function JourneyCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("hf-step-check", className)}
    >
      <path
        d="M5 12.5l4.2 4.2L19 7"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={24}
      />
    </svg>
  );
}

/** Circular progress ring. Purely decorative; pair it with visible text. */
export function ProgressRing({
  value,
  total,
  size = 56,
  stroke = 6,
  className,
  children,
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const gradientId = `hf-step-ring-${useId().replace(/:/g, "")}`;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  return (
    <span
      className={cn(
        "hf-step-ring relative inline-grid place-items-center",
        className
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="-rotate-90"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c5cff" />
            <stop offset="100%" stopColor="#d946ef" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="hf-step-ring-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="hf-step-ring-value"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-extrabold">
        {children}
      </span>
    </span>
  );
}

/** Round badge on the timeline rail. */
export function JourneyBadge({
  state,
  number,
}: {
  state: JourneyStepState;
  number: number;
}) {
  return (
    <span className="hf-step-badge" data-state={state} aria-hidden="true">
      {state === "done" ? (
        <JourneyCheck className="h-5 w-5" />
      ) : (
        <span>{number}</span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Issue-page preview: a lightweight interactive checklist that shares */
/* the guide's local session (lib/session.ts), so progress made here   */
/* carries over into /issues/[slug]/guide and vice versa.              */
/* ------------------------------------------------------------------ */

type PreviewState = {
  currentStepIndex: number;
  attemptedSteps: { step: string; outcome: StepOutcome }[];
  status: TroubleshootingSession["status"];
  solvingStep?: string;
  escalationReason?: string;
  rating?: "helpful" | "not-helpful";
};

const EMPTY_PREVIEW: PreviewState = {
  currentStepIndex: 0,
  attemptedSteps: [],
  status: "in-progress",
};

function defaultPlatform(issue: Issue): string {
  return issue.devices.includes("Windows")
    ? "Windows"
    : (issue.devices[0] ?? "Windows");
}

export function StepJourneyPreview({
  issue,
  platform: platformProp,
  guideHref,
}: {
  issue: Issue;
  /** Same platform label the guide uses (e.g. "Windows"). */
  platform?: string | null;
  /** Link to the full guide; defaults to /issues/<id>/guide. */
  guideHref?: string;
}) {
  const steps = getIssueSteps(issue);
  const platform = platformProp || defaultPlatform(issue);
  const [state, setState] = useState<PreviewState>(EMPTY_PREVIEW);
  const [loaded, setLoaded] = useState(false);
  const [fixedAnswer, setFixedAnswer] = useState<"yes" | "no" | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const saved = getSession(issue.id, platform);
      if (saved) {
        const lastStep = steps[steps.length - 1];
        const pastEnd =
          saved.currentStepIndex >= steps.length - 1 &&
          saved.attemptedSteps.some((attempt) => attempt.step === lastStep);
        setState({
          currentStepIndex: pastEnd ? steps.length : saved.currentStepIndex,
          attemptedSteps: saved.attemptedSteps,
          status: saved.status,
          solvingStep: saved.solvingStep,
          escalationReason: saved.escalationReason,
          rating: saved.rating,
        });
        if (saved.status === "resolved") setFixedAnswer("yes");
      } else {
        setState(EMPTY_PREVIEW);
        setFixedAnswer(null);
      }
      setLoaded(true);
    });
  }, [issue.id, platform, steps]);

  function persist(next: PreviewState) {
    setState(next);
    // The guide expects a real step index, so never store "past the end".
    saveSession({
      issueSlug: issue.id,
      issueTitle: issue.title,
      platform,
      ...next,
      currentStepIndex: Math.min(
        next.currentStepIndex,
        Math.max(0, steps.length - 1)
      ),
      updatedAt: Date.now(),
    });
  }

  const indexes = steps.map((_, index) => index);
  const allReviewed = state.currentStepIndex >= steps.length;
  const stepStates = deriveStepStates({
    indexes,
    steps,
    currentIndex: state.currentStepIndex,
    attempted: state.attemptedSteps,
    completed: [],
    finished: allReviewed || state.status !== "in-progress",
  });
  const doneCount = indexes.filter((i) => stepStates.get(i) === "done").length;
  const reviewedCount = indexes.filter((i) => {
    const s = stepStates.get(i);
    return s !== "current" && s !== "upcoming";
  }).length;
  const minutes = stepMinutes(issue.time, steps.length);
  const showFixedPrompt =
    loaded && (allReviewed || state.status !== "in-progress");

  function act(outcome: StepOutcome | "skip") {
    const index = state.currentStepIndex;
    const step = steps[index];
    if (step === undefined) return;
    const attemptedSteps =
      outcome === "skip"
        ? state.attemptedSteps
        : [...state.attemptedSteps, { step, outcome }];
    const nextIndex = index + 1;
    persist({ ...state, attemptedSteps, currentStepIndex: nextIndex });
  }

  function answerFixed(answer: "yes" | "no") {
    setFixedAnswer(answer);
    if (answer === "yes") {
      const lastDone = [...state.attemptedSteps]
        .reverse()
        .find((a) => a.outcome === "completed")?.step;
      persist({
        ...state,
        status: "resolved",
        solvingStep: state.solvingStep ?? lastDone,
      });
    }
  }

  function rate(rating: "helpful" | "not-helpful") {
    persist({ ...state, rating });
  }

  function reset() {
    setFixedAnswer(null);
    persist({ ...EMPTY_PREVIEW });
  }

  const href = guideHref ?? `/issues/${issue.id}/guide`;

  return (
    <div className="hf-step-journey relative">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">
          Initial troubleshooting steps
        </h2>
        <div className="flex items-center gap-3">
          <ProgressRing
            value={doneCount}
            total={steps.length}
            size={44}
            stroke={5}
          >
            {doneCount}/{steps.length}
          </ProgressRing>
          <p
            aria-live="polite"
            className="text-sm font-semibold text-muted-foreground"
          >
            {doneCount} of {steps.length} done
          </p>
        </div>
      </div>

      <ol className="mt-5 grid gap-0" aria-label="Troubleshooting steps">
        {steps.map((text, index) => {
          const stepState = stepStates.get(index) ?? "upcoming";
          const Icon = stepIconFor(text);
          const isCurrent = stepState === "current";
          const chip = stateChipLabel(stepState);
          return (
            <li
              key={`${index}-${text}`}
              className="hf-step-item relative pb-4 pl-14 last:pb-0"
              data-state={stepState}
              data-step-current={isCurrent ? "true" : undefined}
              style={{ animationDelay: `${0.08 + index * 0.07}s` }}
              aria-current={isCurrent ? "step" : undefined}
            >
              {index < steps.length - 1 && (
                <span
                  className="hf-step-rail"
                  data-filled={
                    stepState !== "current" && stepState !== "upcoming"
                  }
                  aria-hidden="true"
                >
                  <span />
                </span>
              )}
              <span className="absolute left-0 top-1">
                <JourneyBadge state={stepState} number={index + 1} />
              </span>
              <div className="hf-step-card" data-state={stepState}>
                <div className="flex items-start gap-3">
                  <span className="hf-step-icon" aria-hidden="true">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "leading-relaxed",
                        isCurrent ? "font-semibold" : "text-foreground/90"
                      )}
                    >
                      <span className="sr-only">Step {index + 1}: </span>
                      {text}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {chip && (
                        <span className="hf-step-chip" data-state={stepState}>
                          {chip}
                        </span>
                      )}
                      {minutes !== null && (
                        <span
                          className="hf-step-chip"
                          title="Estimated from the guide's total time"
                        >
                          <Clock className="h-3 w-3" aria-hidden />~{minutes}{" "}
                          min
                        </span>
                      )}
                    </div>
                    {isCurrent && loaded && (
                      <div
                        className="hf-step-actions mt-3 flex flex-wrap gap-2"
                        role="group"
                        aria-label={`Step ${index + 1} result`}
                      >
                        <button
                          type="button"
                          className="hf-step-btn"
                          data-variant="primary"
                          onClick={() => act("completed")}
                        >
                          <Check className="h-4 w-4" aria-hidden />
                          Done
                        </button>
                        <button
                          type="button"
                          className="hf-step-btn"
                          onClick={() => act("did-not-work")}
                        >
                          Didn&apos;t work
                        </button>
                        <button
                          type="button"
                          className="hf-step-btn"
                          data-variant="ghost"
                          onClick={() => act("skip")}
                        >
                          Skip
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div aria-live="polite">
        {showFixedPrompt && (
          <div className="hf-step-finale relative mt-5 overflow-hidden rounded-[24px] border border-border bg-card p-5 shadow-sm">
            {fixedAnswer === null && (
              <>
                <p className="flex items-center gap-2 text-lg font-extrabold">
                  <Sparkles className="h-5 w-5 text-primary" aria-hidden />
                  You&apos;ve been through every step. Is it fixed?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="hf-step-btn"
                    data-variant="primary"
                    onClick={() => answerFixed("yes")}
                  >
                    Yes, it&apos;s fixed
                  </button>
                  <button
                    type="button"
                    className="hf-step-btn"
                    onClick={() => answerFixed("no")}
                  >
                    Still broken
                  </button>
                </div>
              </>
            )}
            {fixedAnswer === "yes" && (
              <>
                <p className="flex items-center gap-2 text-lg font-extrabold">
                  <span
                    className="hf-step-badge"
                    data-state="done"
                    aria-hidden="true"
                  >
                    <JourneyCheck className="h-5 w-5" />
                  </span>
                  Great — glad that sorted it!
                </p>
                <p className="mt-3 text-sm font-semibold">
                  Were these steps helpful?
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="hf-step-btn"
                    aria-pressed={state.rating === "helpful"}
                    onClick={() => rate("helpful")}
                  >
                    Helpful
                  </button>
                  <button
                    type="button"
                    className="hf-step-btn"
                    aria-pressed={state.rating === "not-helpful"}
                    onClick={() => rate("not-helpful")}
                  >
                    Not helpful
                  </button>
                </div>
                {state.rating && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Thanks for the feedback.
                  </p>
                )}
              </>
            )}
            {fixedAnswer === "no" && (
              <>
                <p className="text-lg font-extrabold">
                  Let&apos;s get you more help
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try the full guided walkthrough, ask the assistant, or reach a
                  person.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={href}
                    className="hf-step-btn"
                    data-variant="primary"
                  >
                    <Wrench className="h-4 w-4" aria-hidden />
                    Open the guided walkthrough
                  </Link>
                  <Link
                    href={`/assistant?q=${encodeURIComponent(issue.title)}`}
                    className="hf-step-btn"
                  >
                    <Bot className="h-4 w-4" aria-hidden />
                    Ask the assistant
                  </Link>
                  <Link
                    href={`/assistant?q=${encodeURIComponent(issue.title)}&intent=human`}
                    className="hf-step-btn"
                  >
                    <Headset className="h-4 w-4" aria-hidden />
                    Talk to support
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {loaded && reviewedCount > 0 && (
        <button
          type="button"
          onClick={reset}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Start these steps over
        </button>
      )}
    </div>
  );
}
