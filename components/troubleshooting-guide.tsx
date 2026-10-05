"use client";

import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCircle,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Headset,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { BackToResults } from "./back-to-results";
import { cn } from "@/lib/utils";
import type { Issue } from "@/lib/issues";
import { categories } from "@/lib/helpdesk-data";
import { type Platform } from "@/lib/helpdesk-data";
import { normalizePlatform, platformSlug } from "@/lib/platform";
import { buildBrowseReturnHref } from "@/lib/browse-return";
import type { StepOutcome, TroubleshootingSession } from "@/lib/session";
import { clearSession, getSession, saveSession } from "@/lib/session";
import {
  getIssueSteps,
  getIssueSafetyWarning,
  getIssueEscalationWarning,
  getIssueStepMeta,
  getIssueStepSource,
} from "@/lib/steps";
import { saveProgress } from "@/app/actions/guides";
import {
  confirmTicketResolved,
  escalateTicket,
} from "@/app/actions/resolution";
import { recordStepOutcome } from "@/app/actions/tickets";
import type { StepPolicy } from "@/lib/investigation/policy";
import {
  JourneyBadge,
  JourneyCheck,
  ProgressRing,
  deriveStepStates,
  stateChipLabel,
  stepIconFor,
  stepMinutes,
} from "./step-journey";

type TroubleshootingGuideProps = {
  issue: Issue;
  initialCompletedSteps?: number[];
  canPersist?: boolean;
  linkedTicket?: { id: string; alreadyResolved: boolean } | null;
  resolutionTrackingEnabled?: boolean;
  workflowEnabled?: boolean;
  stepPolicies?: StepPolicy[];
};

type GuideState = {
  currentStepIndex: number;
  attemptedSteps: { step: string; outcome: StepOutcome }[];
  status: "in-progress" | "resolved" | "escalated";
  solvingStep?: string;
  escalationReason?: string;
  rating?: "helpful" | "not-helpful";
};

function initialState(): GuideState {
  return {
    currentStepIndex: 0,
    attemptedSteps: [],
    status: "in-progress",
  };
}

function formatOutcome(outcome: StepOutcome): string {
  switch (outcome) {
    case "completed":
      return "Completed";
    case "did-not-work":
      return "Did not work";
    case "cannot-complete":
      return "Could not complete";
  }
}

export function TroubleshootingGuide({
  issue,
  initialCompletedSteps = [],
  canPersist = false,
  linkedTicket = null,
  resolutionTrackingEnabled = false,
  workflowEnabled = false,
  stepPolicies,
}: TroubleshootingGuideProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const platform: string = useMemo(() => {
    const raw = searchParams.get("platform");
    const fromQuery = normalizePlatform(raw);
    return (
      fromQuery ??
      (issue.devices.includes("Windows") ? "Windows" : issue.devices[0])
    );
  }, [searchParams, issue.devices]);
  const browseReturnHref = useMemo(
    () => buildBrowseReturnHref(searchParams),
    [searchParams]
  );

  function handlePlatformChange(nextPlatform: Platform) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("platform", platformSlug(nextPlatform));
    router.replace(`${pathname}?${params.toString()}`);
  }

  const steps = useMemo(() => getIssueSteps(issue), [issue]);
  const stepSource = getIssueStepSource(issue);
  const stepMeta = getIssueStepMeta(issue);
  const categoryLabel =
    categories.find((category) => category.id === issue.category)?.label ??
    issue.category;
  const visibleStepIndexes = useMemo(
    () =>
      stepPolicies
        ? stepPolicies
            .filter(
              (policy) =>
                policy.risk !== "specialist" && policy.risk !== "denied"
            )
            .map((policy) => policy.stepIndex)
        : steps.map((_, index) => index),
    [stepPolicies, steps]
  );
  const [completedSteps, setCompletedSteps] = useState<number[]>(() => [
    ...new Set(initialCompletedSteps),
  ]);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [, startTransition] = useTransition();
  const [state, setState] = useState<GuideState>(() => {
    const firstIncomplete = visibleStepIndexes.find(
      (index) => !initialCompletedSteps.includes(index)
    );
    return {
      ...initialState(),
      currentStepIndex:
        firstIncomplete ??
        visibleStepIndexes[visibleStepIndexes.length - 1] ??
        0,
    };
  });
  const [resolutionNotice, setResolutionNotice] = useState<string | null>(
    linkedTicket?.alreadyResolved
      ? "Recorded: your ticket is marked as resolved."
      : null
  );

  const statusRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const skipInitialStepScroll = useRef(true);
  const completedEventSent = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      const saved = getSession(issue.id, platform);
      if (saved) {
        setState({
          currentStepIndex: saved.currentStepIndex,
          attemptedSteps: saved.attemptedSteps,
          status: saved.status,
          solvingStep: saved.solvingStep,
          escalationReason: saved.escalationReason,
          rating: saved.rating,
        });
      }
      setSessionLoaded(true);
    });
  }, [issue.id, platform]);

  useEffect(() => {
    if (!sessionLoaded) return;
    if (skipInitialStepScroll.current) {
      skipInitialStepScroll.current = false;
      return;
    }
    const bar = progressRef.current;
    const step = document.querySelector<HTMLElement>('[aria-current="step"]');
    if (!bar || !step) return;
    const offset =
      parseFloat(getComputedStyle(bar).top) + bar.offsetHeight + 16;
    const rect = step.getBoundingClientRect();
    if (rect.top < offset || rect.bottom > window.innerHeight) {
      window.scrollTo({
        top: window.scrollY + rect.top - offset,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }
  }, [state.currentStepIndex, sessionLoaded]);

  const totalSteps = visibleStepIndexes.length;
  const currentStep = steps[state.currentStepIndex];
  const outlineSteps = visibleStepIndexes.map((index) => ({
    index,
    text: steps[index],
  }));
  const currentVisiblePosition = Math.max(
    0,
    visibleStepIndexes.indexOf(state.currentStepIndex)
  );

  function advanceStep() {
    const nextIndex = visibleStepIndexes[currentVisiblePosition + 1];
    if (nextIndex === undefined) {
      setState((prev) => ({
        ...prev,
        status: "escalated",
        escalationReason: "Remaining steps for this guide require IT approval.",
      }));
      statusRef.current?.focus();
      return;
    }
    setState((prev) => ({ ...prev, currentStepIndex: nextIndex }));
  }

  useEffect(() => {
    if (!sessionLoaded) return;
    const session: TroubleshootingSession = {
      issueSlug: issue.id,
      issueTitle: issue.title,
      platform,
      currentStepIndex: state.currentStepIndex,
      attemptedSteps: state.attemptedSteps,
      status: state.status,
      solvingStep: state.solvingStep,
      escalationReason: state.escalationReason,
      rating: state.rating,
      updatedAt: Date.now(),
    };
    saveSession(session);
  }, [issue, platform, sessionLoaded, state]);

  function recordAttempt(outcome: StepOutcome) {
    const step = currentStep;
    setState((prev) => ({
      ...prev,
      attemptedSteps: [...prev.attemptedSteps, { step, outcome }],
    }));
    return step;
  }

  function recordLinkedStepOutcome(
    stepIndex: number,
    outcome: "worked" | "failed" | "could_not_perform"
  ) {
    if (!workflowEnabled || !linkedTicket) return;
    void recordStepOutcome(linkedTicket.id, issue.id, stepIndex, outcome).catch(
      () => {}
    );
  }

  function handleCompleted() {
    const stepIndex = state.currentStepIndex;
    const step = recordAttempt("completed");
    recordLinkedStepOutcome(stepIndex, "worked");
    const nextCompleted = [
      ...new Set([...completedSteps, state.currentStepIndex]),
    ];
    setCompletedSteps(nextCompleted);
    if (canPersist) {
      startTransition(() => {
        void saveProgress(issue.id, nextCompleted);
      });
    }
    if (currentVisiblePosition === totalSteps - 1) {
      if (!completedEventSent.current) {
        completedEventSent.current = true;
        void fetch("/api/analytics/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "troubleshooting_completed",
            path: `/issues/${issue.id}/guide`,
            issueId: issue.id,
          }),
          keepalive: true,
        }).catch(() => {});
      }
      setState((prev) => ({
        ...prev,
        status: "resolved",
        solvingStep: step,
      }));
      if (
        resolutionTrackingEnabled &&
        linkedTicket &&
        !linkedTicket.alreadyResolved
      ) {
        startTransition(() => {
          void confirmTicketResolved(linkedTicket.id).then((result) => {
            setResolutionNotice(
              "success" in result
                ? "Recorded: your ticket is marked as resolved."
                : result.error
            );
          });
        });
      }
      statusRef.current?.focus();
    } else {
      advanceStep();
    }
  }

  function handleDidNotWork() {
    const stepIndex = state.currentStepIndex;
    recordAttempt("did-not-work");
    recordLinkedStepOutcome(stepIndex, "failed");
    if (currentVisiblePosition === totalSteps - 1) {
      setState((prev) => ({ ...prev, status: "escalated" }));
      statusRef.current?.focus();
    } else {
      advanceStep();
    }
  }

  function handleApprovalRequest() {
    const reason = "This step requires IT approval.";
    if (resolutionTrackingEnabled && linkedTicket) {
      startTransition(() => {
        void escalateTicket(linkedTicket.id, reason).then((result) => {
          setResolutionNotice(
            "success" in result ? "Sent to IT for approval." : result.error
          );
        });
      });
    } else {
      setState((prev) => ({
        ...prev,
        status: "escalated",
        escalationReason: reason,
      }));
      statusRef.current?.focus();
    }
  }

  function handleCannotComplete() {
    const stepIndex = state.currentStepIndex;
    recordAttempt("cannot-complete");
    recordLinkedStepOutcome(stepIndex, "could_not_perform");
    setState((prev) => ({ ...prev, status: "escalated" }));
    statusRef.current?.focus();
  }

  function handleSolved() {
    if (!completedEventSent.current) {
      completedEventSent.current = true;
      void fetch("/api/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "troubleshooting_completed",
          path: `/issues/${issue.id}/guide`,
          issueId: issue.id,
        }),
        keepalive: true,
      }).catch(() => {});
    }
    setState((prev) => ({
      ...prev,
      status: "resolved",
      solvingStep: currentStep,
      attemptedSteps: [
        ...prev.attemptedSteps,
        { step: currentStep, outcome: "completed" },
      ],
    }));
    if (
      resolutionTrackingEnabled &&
      linkedTicket &&
      !linkedTicket.alreadyResolved
    ) {
      startTransition(() => {
        void confirmTicketResolved(linkedTicket.id).then((result) => {
          setResolutionNotice(
            "success" in result
              ? "Recorded: your ticket is marked as resolved."
              : result.error
          );
        });
      });
    }
    statusRef.current?.focus();
  }

  function handleRestart() {
    clearSession(issue.id, platform);
    setCompletedSteps([]);
    if (canPersist) {
      startTransition(() => {
        void saveProgress(issue.id, []);
      });
    }
    setState(initialState());
    statusRef.current?.focus();
  }

  function handleClearHistory() {
    clearSession(issue.id, platform);
    setCompletedSteps([]);
    setState(initialState());
    if (canPersist) {
      startTransition(() => {
        void saveProgress(issue.id, []);
      });
    }
    statusRef.current?.focus();
  }

  const finished = state.status !== "in-progress";
  const stepStates = deriveStepStates({
    indexes: visibleStepIndexes,
    steps,
    currentIndex: state.currentStepIndex,
    attempted: state.attemptedSteps,
    completed: completedSteps,
    finished,
  });
  const doneCount = visibleStepIndexes.filter(
    (index) => stepStates.get(index) === "done"
  ).length;
  const reviewedCount = visibleStepIndexes.filter((index) => {
    const stepState = stepStates.get(index);
    return stepState !== "current" && stepState !== "upcoming";
  }).length;
  const barRatio = finished
    ? 1
    : totalSteps > 0
      ? reviewedCount / totalSteps
      : 0;
  const perStepMinutes = stepMinutes(issue.time, totalSteps);
  const safetyWarning = getIssueSafetyWarning(issue);
  const escalationWarning = getIssueEscalationWarning(issue);
  // Legacy edge case: a restart can point at a step hidden by policy.
  const currentHidden =
    !finished && !visibleStepIndexes.includes(state.currentStepIndex);
  const stepViewProps = {
    issue,
    state,
    onCompleted: handleCompleted,
    onDidNotWork: handleDidNotWork,
    onCannotComplete: handleCannotComplete,
    onSolved: handleSolved,
    onSkip: advanceStep,
    onApprovalRequest: handleApprovalRequest,
    stepPolicies,
    minutes: perStepMinutes,
  };
  const progressCaption =
    state.status === "resolved"
      ? "Resolved — nice work"
      : state.status === "escalated"
        ? "Needs a hand from IT"
        : `Up now: step ${currentVisiblePosition + 1}`;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="lg:grid lg:grid-cols-[minmax(0,760px)_280px] lg:items-start lg:gap-10">
        <div className="min-w-0">
          <div className="mb-6">
            <BackToResults />
          </div>

          <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-[2.75rem]">
            {issue.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {issue.devices.length > 1 ? (
              <div className="flex items-center gap-2">
                <label htmlFor="guide-platform" className="font-medium">
                  Platform
                </label>
                <select
                  id="guide-platform"
                  value={platform}
                  onChange={(event) =>
                    handlePlatformChange(event.target.value as Platform)
                  }
                  className="rounded-md border border-input bg-background px-2 py-1 text-foreground"
                >
                  {issue.devices.map((device) => (
                    <option key={device} value={device}>
                      {device}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span>Platform: {platform}</span>
            )}
            {issue.time && (
              <span className="hf-step-chip">
                <Clock className="h-3 w-3" aria-hidden />
                About {issue.time} in total
              </span>
            )}
          </div>

          <div
            ref={progressRef}
            className="hf-step-progress sticky top-24 z-20 mt-5 flex items-center gap-4 rounded-2xl border border-border p-3 shadow-sm"
          >
            <ProgressRing value={doneCount} total={totalSteps} size={52}>
              {totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0}%
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <p aria-live="polite" className="text-sm font-extrabold">
                {doneCount} of {totalSteps} done
              </p>
              <p className="text-xs font-semibold text-muted-foreground">
                {progressCaption}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="hf-step-bar h-full rounded-full"
                  style={{ width: `${barRatio * 100}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>

          <div
            ref={statusRef}
            tabIndex={-1}
            aria-live="polite"
            className="mt-4 outline-none"
          >
            {state.status === "resolved" ? (
              <SuccessView
                state={state}
                onChange={setState}
                onRestart={handleRestart}
                resolutionNotice={resolutionNotice}
                browseReturnHref={browseReturnHref}
                issueTitle={issue.title}
              />
            ) : state.status === "escalated" ? (
              <EscalationView
                issue={issue}
                platform={platform}
                state={state}
                onChange={setState}
                onRestart={handleRestart}
                linkedTicket={linkedTicket}
                resolutionTrackingEnabled={resolutionTrackingEnabled}
                browseReturnHref={browseReturnHref}
              />
            ) : null}

            {currentHidden && (
              <div className="mt-6">
                <StepView key={state.currentStepIndex} {...stepViewProps} />
              </div>
            )}

            <ol
              aria-label="Troubleshooting steps"
              className={cn("hf-step-journey", finished ? "mt-8" : "mt-6")}
            >
              {outlineSteps.map(({ index, text }, position) => {
                const stepState = stepStates.get(index) ?? "upcoming";
                const isCurrent = stepState === "current";
                const Icon = stepIconFor(text);
                const chip = stateChipLabel(stepState);
                return (
                  <li
                    key={`${index}-${text}`}
                    className="hf-step-item relative pb-4 pl-14 last:pb-0"
                    data-state={stepState}
                    style={{ animationDelay: `${0.06 + position * 0.07}s` }}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {position < outlineSteps.length - 1 && (
                      <span
                        className="hf-step-rail"
                        data-filled={!isCurrent && stepState !== "upcoming"}
                        aria-hidden="true"
                      >
                        <span />
                      </span>
                    )}
                    <span className="absolute left-0 top-1">
                      <JourneyBadge state={stepState} number={position + 1} />
                    </span>
                    {isCurrent ? (
                      <StepView
                        key={state.currentStepIndex}
                        {...stepViewProps}
                      />
                    ) : (
                      <div className="hf-step-card" data-state={stepState}>
                        <div className="flex items-start gap-3">
                          <span className="hf-step-icon" aria-hidden="true">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="leading-relaxed text-foreground/90">
                              <span className="sr-only">
                                Step {position + 1}:{" "}
                              </span>
                              {text}
                            </p>
                            {chip && (
                              <span
                                className="hf-step-chip mt-2"
                                data-state={stepState}
                              >
                                {chip}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>

          {state.status === "in-progress" && (
            <div className="mt-6 space-y-4">
              {safetyWarning && state.currentStepIndex === 0 && (
                <div className="rounded-[24px] border border-accent-foreground/20 bg-accent p-5 text-accent-foreground">
                  <p className="font-semibold">Safety note</p>
                  <p className="mt-1">{safetyWarning}</p>
                </div>
              )}

              {escalationWarning && (
                <div className="rounded-[24px] border border-destructive/30 bg-destructive/10 p-5 text-destructive">
                  <p className="font-semibold">Escalate if needed</p>
                  <p className="mt-1">{escalationWarning}</p>
                </div>
              )}

              <button
                type="button"
                onClick={handleClearHistory}
                className="text-sm text-muted-foreground underline hover:text-foreground"
              >
                Clear my troubleshooting history for this issue
              </button>
            </div>
          )}

          {stepSource === "category" && (
            <p className="mt-4 text-sm text-muted-foreground">
              These are general steps for {categoryLabel}. If they don&apos;t
              match your situation, use Contact support / escalate.
            </p>
          )}
          {stepMeta?.sources && stepMeta.sources.length > 0 && (
            <div className="mt-6 text-sm">
              <h2 className="font-semibold">Sources</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {stepMeta.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-muted-foreground">
                Reviewed {stepMeta.reviewedAt}
              </p>
            </div>
          )}
        </div>
        <nav
          aria-label="Guide outline"
          className="sticky top-24 mt-8 hidden rounded-2xl border border-border bg-card p-4 shadow-sm lg:block"
        >
          <p className="font-medium">Guide outline</p>
          <ol className="mt-3 space-y-2.5 text-sm">
            {outlineSteps.map(({ index, text }, outlineIndex) => {
              const stepState = stepStates.get(index) ?? "upcoming";
              return (
                <li
                  key={`${index}-${text}`}
                  data-state={stepState}
                  className={cn(
                    "hf-step-outline flex gap-2.5",
                    index === state.currentStepIndex && !finished
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <span
                    className="hf-step-dot"
                    data-state={stepState}
                    aria-hidden="true"
                  >
                    {stepState === "done" ? (
                      <JourneyCheck className="h-3 w-3" />
                    ) : (
                      outlineIndex + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="sr-only">{outlineIndex + 1}. </span>
                    {text}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </div>
  );
}

function StepView({
  issue,
  state,
  onCompleted,
  onDidNotWork,
  onCannotComplete,
  onSolved,
  onSkip,
  onApprovalRequest,
  stepPolicies,
  minutes,
}: {
  issue: Issue;
  state: GuideState;
  onCompleted: () => void;
  onDidNotWork: () => void;
  onCannotComplete: () => void;
  onSolved: () => void;
  onSkip: () => void;
  onApprovalRequest: () => void;
  stepPolicies?: StepPolicy[];
  minutes: number | null;
}) {
  const index = state.currentStepIndex;
  const steps = getIssueSteps(issue);
  const visibleSteps = stepPolicies
    ? stepPolicies.filter(
        (policy) => policy.risk !== "specialist" && policy.risk !== "denied"
      )
    : steps.map((text, stepIndex) => ({
        guideSlug: issue.id,
        stepIndex,
        text,
        risk: "safe" as const,
        reason: "no elevated risk rule matched",
      }));
  const visiblePosition = Math.max(
    0,
    visibleSteps.findIndex((policy) => policy.stepIndex === index)
  );
  const total = visibleSteps.length;
  const step = steps[index];
  const policy = stepPolicies?.find((item) => item.stepIndex === index);
  const [confirmed, setConfirmed] = useState(false);
  const isLast = visiblePosition >= total - 1;

  return (
    <div className="hf-step-card hf-step-expand" data-state="current">
      <div className="flex flex-wrap items-center gap-2">
        <span className="hf-step-icon" data-state="current" aria-hidden="true">
          {createElement(stepIconFor(step ?? ""), { className: "h-4 w-4" })}
        </span>
        <p
          data-testid="step-count"
          aria-live="polite"
          className="text-sm font-extrabold text-primary"
        >
          Step {visiblePosition + 1} of {total}
        </p>
        {minutes !== null && (
          <span
            className="hf-step-chip"
            title="Estimated from the guide's total time"
          >
            <Clock className="h-3 w-3" aria-hidden />~{minutes} min
          </span>
        )}
      </div>

      <h2
        data-testid="step-title"
        className={cn(
          "mt-3 text-xl font-bold leading-snug",
          policy?.risk === "approval" && "text-muted-foreground"
        )}
      >
        {step}
      </h2>
      {policy && policy.risk !== "safe" && (
        <span
          className={`mt-3 inline-flex rounded-full border px-2 py-1 text-xs ${
            policy.risk === "caution"
              ? "border-amber-500/60 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              : "border-border text-muted-foreground"
          }`}
        >
          {policy.risk === "caution" ? "Confirm first" : "Requires IT approval"}
        </span>
      )}

      <div className="mt-5">
        {policy?.risk === "approval" ? (
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={onApprovalRequest}>
              Ask IT to approve
            </Button>
            <Button type="button" variant="outline" onClick={onSkip}>
              Skip
            </Button>
          </div>
        ) : policy?.risk === "caution" && !confirmed ? (
          <Button type="button" onClick={() => setConfirmed(true)}>
            I understand, continue
          </Button>
        ) : (
          <div role="group" aria-labelledby={`hf-step-q-${index}`}>
            <p
              id={`hf-step-q-${index}`}
              className="mb-2.5 text-sm font-bold text-muted-foreground"
            >
              {isLast ? "Last step — is it fixed now?" : "How did it go?"}
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Button
                type="button"
                variant="default"
                onClick={onSolved}
                className="hf-step-solve"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Problem solved
              </Button>

              <Button type="button" variant="outline" onClick={onCompleted}>
                <Check className="mr-2 h-4 w-4" aria-hidden />
                Completed, still testing
              </Button>

              <Button type="button" variant="outline" onClick={onDidNotWork}>
                Didn&apos;t work
              </Button>

              <Button type="button" variant="ghost" onClick={onCannotComplete}>
                <XCircle className="mr-2 h-4 w-4" />
                Can&apos;t do this
              </Button>
            </div>
            {!isLast && (
              <button
                type="button"
                onClick={onSkip}
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Skip this step for now
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
function HelpLinks({ issueTitle }: { issueTitle: string }) {
  const q = encodeURIComponent(issueTitle);
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Link
        href={`/assistant?q=${q}`}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "hf-step-help"
        )}
      >
        <Bot className="mr-1.5 h-4 w-4" aria-hidden />
        Ask the assistant
      </Link>
      <Link
        href={`/assistant?q=${q}&intent=human`}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "hf-step-help"
        )}
      >
        <Headset className="mr-1.5 h-4 w-4" aria-hidden />
        Contact support
      </Link>
    </div>
  );
}

function SuccessView({
  state,
  onChange,
  onRestart,
  resolutionNotice,
  browseReturnHref,
  issueTitle,
}: {
  state: GuideState;
  onChange: (state: GuideState) => void;
  onRestart: () => void;
  resolutionNotice: string | null;
  browseReturnHref: string;
  issueTitle: string;
}) {
  function handleRate(rating: "helpful" | "not-helpful") {
    onChange({ ...state, rating });
  }

  return (
    <div className="hf-step-finale glass-strong relative mt-6 overflow-hidden p-6 text-center">
      <span className="hf-step-trophy mx-auto" aria-hidden="true">
        <JourneyCheck className="h-9 w-9" />
      </span>
      <h2 data-testid="guide-status" className="mt-4 text-2xl font-extrabold">
        Problem solved
      </h2>

      {state.solvingStep && (
        <p className="mt-2 text-muted-foreground">
          The step that resolved it:{" "}
          <span className="text-foreground">{state.solvingStep}</span>
        </p>
      )}
      {resolutionNotice && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {resolutionNotice}
        </p>
      )}

      <div className="mt-6">
        <p className="font-medium">Was this guide helpful?</p>
        <div className="mt-3 flex justify-center gap-3">
          <Button
            type="button"
            variant={state.rating === "helpful" ? "default" : "outline"}
            aria-pressed={state.rating === "helpful"}
            onClick={() => handleRate("helpful")}
          >
            Yes
          </Button>
          <Button
            type="button"
            variant={state.rating === "not-helpful" ? "destructive" : "outline"}
            aria-pressed={state.rating === "not-helpful"}
            onClick={() => handleRate("not-helpful")}
          >
            No
          </Button>
        </div>
        {state.rating && (
          <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
            Thank you for your feedback.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
        <p className="text-sm font-semibold text-muted-foreground">
          Came back, or only partly better?
        </p>
        <div className="mt-3 flex flex-col items-center gap-3">
          <HelpLinks issueTitle={issueTitle} />
          <button
            type="button"
            onClick={() => onChange({ ...state, status: "escalated" })}
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            It&apos;s still happening — prepare a report for IT
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button type="button" variant="outline" onClick={onRestart}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Restart this guide
        </Button>
        <Link
          href={browseReturnHref}
          className={cn(buttonVariants({ variant: "ghost" }))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to results
        </Link>
      </div>
    </div>
  );
}

function EscalationView({
  issue,
  platform,
  state,
  onChange,
  onRestart,
  linkedTicket,
  resolutionTrackingEnabled,
  browseReturnHref,
}: {
  issue: Issue;
  platform: string;
  state: GuideState;
  onChange: (state: GuideState) => void;
  onRestart: () => void;
  linkedTicket: { id: string; alreadyResolved: boolean } | null;
  resolutionTrackingEnabled: boolean;
  browseReturnHref: string;
}) {
  const [reason, setReason] = useState(state.escalationReason ?? "");
  const [showReport, setShowReport] = useState(Boolean(state.escalationReason));
  const [copied, setCopied] = useState(false);
  const [escalationSent, setEscalationSent] = useState(false);
  const [escalationError, setEscalationError] = useState<string | null>(null);

  const report = useMemo(() => {
    const lines = [
      "HelpDesk First - Escalation Report",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      `Issue: ${issue.title}`,
      `Platform: ${platform}`,
      "",
      "Attempted steps:",
      ...state.attemptedSteps.map(
        (attempt, index) =>
          `${index + 1}. ${attempt.step} (${formatOutcome(attempt.outcome)})`
      ),
      "",
      `Reason for escalation: ${state.escalationReason || "Not provided"}`,
      "",
      "Recommended next step: Contact your IT team for further assistance.",
    ];
    return lines.join("\n");
  }, [issue.title, platform, state]);

  function handleGenerateReport() {
    const trimmed = reason.trim();
    onChange({ ...state, escalationReason: trimmed });
    setShowReport(true);
  }

  function handleCopy() {
    if (typeof navigator === "undefined") return;
    navigator.clipboard.writeText(report).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `escalation-${issue.id}-${platform.toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="glass-strong hf-step-expand mt-6 p-6 shadow-sm">
      <h2 data-testid="guide-status" className="text-2xl font-extrabold">
        This problem is unresolved
      </h2>
      <p className="mt-2 text-muted-foreground">
        You can generate an escalation report for your IT team.
      </p>

      {!showReport ? (
        <div className="mt-6 space-y-4">
          <label htmlFor="escalation-reason" className="block font-medium">
            Why could you not resolve this problem? (optional)
          </label>
          <textarea
            id="escalation-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-border/70 bg-background/60 p-3 text-foreground backdrop-blur outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. I do not have permission to restart the router."
          />
          <Button type="button" onClick={handleGenerateReport}>
            Generate report
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">
            {report}
          </pre>

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={handleCopy}>
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copied" : "Copy report"}
            </Button>
            <Button type="button" variant="outline" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Download report
            </Button>
          </div>
        </div>
      )}

      {resolutionTrackingEnabled && linkedTicket && !escalationSent && (
        <div className="mt-6">
          <Button
            type="button"
            onClick={() => {
              setEscalationError(null);
              void escalateTicket(linkedTicket.id, reason).then((result) => {
                if ("success" in result) {
                  setEscalationSent(true);
                } else {
                  setEscalationError(result.error);
                }
              });
            }}
          >
            Send to your IT team
          </Button>
          {escalationError && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {escalationError}
            </p>
          )}
        </div>
      )}
      {escalationSent && (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          Sent to IT.{" "}
          <Link href="/tickets" className="underline">
            Track it under My tickets.
          </Link>
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
        <p className="mb-3 text-sm font-semibold text-muted-foreground">
          Prefer to talk it through?
        </p>
        <HelpLinks issueTitle={issue.title} />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={onRestart}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Restart the guide
        </Button>
        <Link
          href={browseReturnHref}
          className={cn(buttonVariants({ variant: "ghost" }))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to results
        </Link>
      </div>
    </div>
  );
}
