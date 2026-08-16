"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  Copy,
  Download,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { BackToResults } from "./back-to-results";
import { cn } from "@/lib/utils";
import type { Issue } from "@/lib/knowledge-base";
import { platforms, type Platform } from "@/lib/helpdesk-data";
import type { StepOutcome, TroubleshootingSession } from "@/lib/session";
import { clearSession, getSession, saveSession } from "@/lib/session";

type TroubleshootingGuideProps = {
  issue: Issue;
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

export function TroubleshootingGuide({ issue }: TroubleshootingGuideProps) {
  const searchParams = useSearchParams();
  const platform: string = useMemo(() => {
    const raw = searchParams.get("platform");
    const fromQuery =
      raw && platforms.includes(raw as Platform) ? (raw as Platform) : null;
    return fromQuery ?? issue.platforms[0];
  }, [searchParams, issue.platforms]);

  const [state, setState] = useState<GuideState>(() => {
    const saved = getSession(issue.slug, platform);
    if (saved) {
      return {
        currentStepIndex: saved.currentStepIndex,
        attemptedSteps: saved.attemptedSteps,
        status: saved.status,
        solvingStep: saved.solvingStep,
        escalationReason: saved.escalationReason,
        rating: saved.rating,
      };
    }
    return initialState();
  });

  const statusRef = useRef<HTMLDivElement>(null);

  const totalSteps = issue.steps.length;
  const currentStep = issue.steps[state.currentStepIndex];

  useEffect(() => {
    const session: TroubleshootingSession = {
      issueSlug: issue.slug,
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
  }, [issue, platform, state]);

  function recordAttempt(outcome: StepOutcome) {
    const step = currentStep;
    setState((prev) => ({
      ...prev,
      attemptedSteps: [...prev.attemptedSteps, { step, outcome }],
    }));
    return step;
  }

  function handleCompleted() {
    const step = recordAttempt("completed");
    if (state.currentStepIndex === totalSteps - 1) {
      setState((prev) => ({
        ...prev,
        status: "resolved",
        solvingStep: step,
      }));
      statusRef.current?.focus();
    } else {
      setState((prev) => ({
        ...prev,
        currentStepIndex: prev.currentStepIndex + 1,
      }));
    }
  }

  function handleDidNotWork() {
    recordAttempt("did-not-work");
    if (state.currentStepIndex === totalSteps - 1) {
      setState((prev) => ({ ...prev, status: "escalated" }));
      statusRef.current?.focus();
    } else {
      setState((prev) => ({
        ...prev,
        currentStepIndex: prev.currentStepIndex + 1,
      }));
    }
  }

  function handleCannotComplete() {
    recordAttempt("cannot-complete");
    setState((prev) => ({ ...prev, status: "escalated" }));
    statusRef.current?.focus();
  }

  function handleSolved() {
    setState((prev) => ({
      ...prev,
      status: "resolved",
      solvingStep: currentStep,
      attemptedSteps: [
        ...prev.attemptedSteps,
        { step: currentStep, outcome: "completed" },
      ],
    }));
    statusRef.current?.focus();
  }

  function handleRestart() {
    clearSession(issue.slug, platform);
    setState(initialState());
    statusRef.current?.focus();
  }

  const progress =
    state.status === "in-progress" ? state.currentStepIndex + 1 : totalSteps;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6">
        <BackToResults />
      </div>

      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {issue.title}
      </h1>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>Platform: {platform}</span>
        <span>{totalSteps} steps</span>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${(progress / totalSteps) * 100}%` }}
          aria-hidden="true"
        />
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
          />
        ) : state.status === "escalated" ? (
          <EscalationView
            issue={issue}
            platform={platform}
            state={state}
            onChange={setState}
            onRestart={handleRestart}
          />
        ) : (
          <StepView
            issue={issue}
            platform={platform}
            state={state}
            onCompleted={handleCompleted}
            onDidNotWork={handleDidNotWork}
            onCannotComplete={handleCannotComplete}
            onSolved={handleSolved}
          />
        )}
      </div>
    </div>
  );
}

function StepView({
  issue,
  platform,
  state,
  onCompleted,
  onDidNotWork,
  onCannotComplete,
  onSolved,
}: {
  issue: Issue;
  platform: string;
  state: GuideState;
  onCompleted: () => void;
  onDidNotWork: () => void;
  onCannotComplete: () => void;
  onSolved: () => void;
}) {
  const index = state.currentStepIndex;
  const total = issue.steps.length;
  const step = issue.steps[index];

  return (
    <div className="mt-6 space-y-6">
      <p
        data-testid="step-count"
        aria-live="polite"
        className="text-sm font-medium text-muted-foreground"
      >
        Step {index + 1} of {total}
      </p>

      <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
        <h2 data-testid="step-title" className="text-xl font-semibold">
          {step}
        </h2>
      </div>

      {issue.safetyWarning && index === 0 && (
        <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-900">
          <p className="font-semibold">Safety note</p>
          <p className="mt-1">{issue.safetyWarning}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button type="button" variant="default" onClick={onSolved}>
          <CheckCircle className="mr-2 h-4 w-4" />
          Problem solved
        </Button>

        <Button type="button" variant="outline" onClick={onCompleted}>
          I completed this step
        </Button>

        <Button type="button" variant="outline" onClick={onDidNotWork}>
          This did not work
        </Button>

        <Button type="button" variant="ghost" onClick={onCannotComplete}>
          <XCircle className="mr-2 h-4 w-4" />I cannot complete this step
        </Button>
      </div>

      {issue.escalationWarning && (
        <div className="rounded-lg border-l-4 border-destructive bg-destructive/5 p-4 text-destructive">
          <p className="font-semibold">Escalate if needed</p>
          <p className="mt-1">{issue.escalationWarning}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => clearSession(issue.slug, platform)}
        className="text-sm text-muted-foreground underline hover:text-foreground"
      >
        Clear my troubleshooting history for this issue
      </button>
    </div>
  );
}

function SuccessView({
  state,
  onChange,
  onRestart,
}: {
  state: GuideState;
  onChange: (state: GuideState) => void;
  onRestart: () => void;
}) {
  function handleRate(rating: "helpful" | "not-helpful") {
    onChange({ ...state, rating });
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-background p-6 text-center shadow-sm">
      <CheckCircle className="mx-auto h-12 w-12 text-emerald-600" />
      <h2 data-testid="guide-status" className="mt-4 text-2xl font-semibold">
        Problem solved
      </h2>

      {state.solvingStep && (
        <p className="mt-2 text-muted-foreground">
          The step that resolved it:{" "}
          <span className="text-foreground">{state.solvingStep}</span>
        </p>
      )}

      <div className="mt-6">
        <p className="font-medium">Was this guide helpful?</p>
        <div className="mt-3 flex justify-center gap-3">
          <Button
            type="button"
            variant={state.rating === "helpful" ? "default" : "outline"}
            onClick={() => handleRate("helpful")}
          >
            Yes
          </Button>
          <Button
            type="button"
            variant={state.rating === "not-helpful" ? "destructive" : "outline"}
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

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button type="button" variant="outline" onClick={onRestart}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Restart the guide
        </Button>
        <Link href="/" className={cn(buttonVariants({ variant: "ghost" }))}>
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
}: {
  issue: Issue;
  platform: string;
  state: GuideState;
  onChange: (state: GuideState) => void;
  onRestart: () => void;
}) {
  const [reason, setReason] = useState(state.escalationReason ?? "");
  const [showReport, setShowReport] = useState(Boolean(state.escalationReason));
  const [copied, setCopied] = useState(false);

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
    a.download = `escalation-${issue.slug}-${platform.toLowerCase()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-background p-6 shadow-sm">
      <h2 data-testid="guide-status" className="text-2xl font-semibold">
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
            className="w-full rounded-lg border border-border bg-background p-3 text-foreground outline-none focus:ring-2 focus:ring-ring"
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

      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={onRestart}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Restart the guide
        </Button>
        <Link href="/" className={cn(buttonVariants({ variant: "ghost" }))}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to results
        </Link>
      </div>
    </div>
  );
}
