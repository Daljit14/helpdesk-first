"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Loader2,
  Shield,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { platforms, type Platform } from "@/lib/helpdesk-data";
import {
  diagnosticQuestions,
  type AiIntakeOutput,
  type DiagnosticAnswer,
} from "@/lib/ai/types";
import { startAiTicket } from "@/app/actions/resolution";

const MAX_QUESTIONS = 3;

export function AiAssistant({
  resolutionTrackingEnabled = false,
  signedIn = false,
}: {
  resolutionTrackingEnabled?: boolean;
  signedIn?: boolean;
}) {
  const router = useRouter();
  const [problem, setProblem] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [previousAnswers, setPreviousAnswers] = useState<DiagnosticAnswer[]>(
    []
  );
  const [currentOutput, setCurrentOutput] = useState<AiIntakeOutput | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [diagnosticAnswer, setDiagnosticAnswer] = useState("");

  const statusRef = useRef<HTMLDivElement>(null);

  async function submitIntake(
    nextProblem = problem,
    nextPlatform = platform,
    nextAnswers = previousAnswers,
    isFirstSubmission = false
  ) {
    if (isFirstSubmission) {
      void fetch("/api/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assistant_start",
          path: "/assistant",
          platform: nextPlatform,
        }),
        keepalive: true,
      }).catch(() => {});
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: nextProblem,
          platform: nextPlatform,
          previousAnswers: nextAnswers,
        }),
      });

      const data = (await response.json()) as {
        status: string;
        output?: AiIntakeOutput;
        reason?: string;
      };

      if (response.status === 503 || data.status === "unavailable") {
        setError(
          data.reason ?? "The support assistant is not available right now."
        );
      } else if (data.status === "escalate") {
        setCurrentOutput({
          decision: "escalate",
          escalationReason:
            data.reason ??
            "This request cannot be handled by the support assistant.",
        });
      } else if (data.status === "ok" && data.output) {
        setCurrentOutput(data.output);
      } else {
        setError("Something went wrong. Please try the search page.");
      }
    } catch {
      setError(
        "The support assistant is not responding. Please use the search page."
      );
    } finally {
      setLoading(false);
      setTimeout(() => statusRef.current?.focus(), 0);
    }
  }

  function handleStart(event: FormEvent) {
    event.preventDefault();
    if (!problem.trim()) return;
    setStarted(true);
    void submitIntake(problem.trim(), null, [], true);
  }

  function handleSubmitPlatform(event: FormEvent) {
    event.preventDefault();
    if (!platform) return;
    const answers: DiagnosticAnswer[] = [
      ...previousAnswers,
      { questionId: "which-platform", answer: platform },
    ];
    setPreviousAnswers(answers);
    void submitIntake(problem, platform, answers);
  }

  function handleSubmitAnswer(questionId: string, event: FormEvent) {
    event.preventDefault();
    if (!diagnosticAnswer.trim()) return;
    const answers: DiagnosticAnswer[] = [
      ...previousAnswers,
      { questionId, answer: diagnosticAnswer.trim() },
    ];
    setPreviousAnswers(answers);
    setDiagnosticAnswer("");
    void submitIntake(problem, platform, answers);
  }

  function handleRejectMatch() {
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "ai_recommendation_rejected",
        path: "/assistant",
      }),
      keepalive: true,
    }).catch(() => {});
    setCurrentOutput({
      decision: "escalate",
      escalationReason:
        "The suggested guide did not match your problem. You can use the search page to find the right topic or contact your IT team.",
    });
  }

  function handleRestart() {
    setProblem("");
    setPlatform(null);
    setPreviousAnswers([]);
    setCurrentOutput(null);
    setError(null);
    setStarted(false);
    setDiagnosticAnswer("");
  }

  function searchHref() {
    const params = new URLSearchParams();
    if (problem) params.set("q", problem);
    if (platform) params.set("platform", platform);
    return params.toString() ? `/?${params.toString()}` : "/";
  }

  if (error) {
    return (
      <UnavailableView
        error={error}
        onRestart={handleRestart}
        searchHref={searchHref()}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Bot className="h-8 w-8 text-primary" aria-hidden="true" />
        <h1 className="text-3xl font-bold tracking-tight">
          Ask the Support Assistant
        </h1>
      </div>

      <p className="text-muted-foreground">
        Describe your IT problem in plain language. The assistant will match you
        to an approved HelpDesk First guide. It will never ask for your password
        or take remote control of your device.
      </p>

      <div className="mt-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-900">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm">
            Do not enter passwords, security codes, recovery keys, serial
            numbers, or any personal or company-confidential information.
          </p>
        </div>
      </div>

      <div
        ref={statusRef}
        tabIndex={-1}
        aria-live="polite"
        className="mt-8 outline-none"
      >
        {!started ? (
          <form onSubmit={handleStart} className="mt-8 space-y-4">
            <label htmlFor="problem-description" className="block font-medium">
              What problem are you experiencing?
            </label>
            <textarea
              id="problem-description"
              value={problem}
              onChange={(event) => setProblem(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-border bg-background p-3 text-foreground outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. My computer is very slow after I open email."
              disabled={loading}
            />
            <Button type="submit" disabled={!problem.trim() || loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Continue
            </Button>
          </form>
        ) : currentOutput?.decision === "match" ? (
          <MatchView
            output={currentOutput}
            platform={platform}
            onReject={handleRejectMatch}
            searchHref={searchHref()}
            resolutionTrackingEnabled={resolutionTrackingEnabled}
            signedIn={signedIn}
            onStartTicket={(href) => router.push(href)}
          />
        ) : currentOutput?.decision === "escalate" ? (
          <EscalateView
            reason={currentOutput.escalationReason ?? ""}
            searchHref={searchHref()}
            onRestart={handleRestart}
          />
        ) : currentOutput?.decision === "clarify" ? (
          <ClarifyView
            output={currentOutput}
            platform={platform}
            answer={diagnosticAnswer}
            onAnswerChange={setDiagnosticAnswer}
            onPlatformSelect={setPlatform}
            onSubmitPlatform={handleSubmitPlatform}
            onSubmitAnswer={handleSubmitAnswer}
            previousAnswers={previousAnswers}
            loading={loading}
            problem={problem}
          />
        ) : (
          <div className="mt-8">
            <Loader2
              className="h-8 w-8 animate-spin text-primary"
              aria-label="Loading"
            />
          </div>
        )}
      </div>

      {started && (
        <div className="mt-8">
          <button
            type="button"
            onClick={handleRestart}
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

function ClarifyView({
  output,
  platform,
  answer,
  onAnswerChange,
  onPlatformSelect,
  onSubmitPlatform,
  onSubmitAnswer,
  previousAnswers,
  loading,
  problem,
}: {
  output: AiIntakeOutput;
  platform: Platform | null;
  answer: string;
  onAnswerChange: (value: string) => void;
  onPlatformSelect: (value: Platform) => void;
  onSubmitPlatform: (event: FormEvent) => void;
  onSubmitAnswer: (questionId: string, event: FormEvent) => void;
  previousAnswers: DiagnosticAnswer[];
  loading: boolean;
  problem: string;
}) {
  const firstQuestionId = output.diagnosticQuestionIds?.[0];
  const question = diagnosticQuestions.find((q) => q.id === firstQuestionId);

  if (firstQuestionId === "which-platform") {
    return (
      <form onSubmit={onSubmitPlatform} className="mt-8 space-y-4">
        <fieldset>
          <legend className="mb-3 block font-medium">
            Which device or operating system are you using?
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {platforms.map((p) => (
              <label
                key={p}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background p-4",
                  platform === p && "border-primary ring-1 ring-primary"
                )}
              >
                <input
                  type="radio"
                  name="platform"
                  value={p}
                  checked={platform === p}
                  onChange={() => onPlatformSelect(p)}
                  className="h-4 w-4"
                />
                <span>{p}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" disabled={!platform || loading}>
          Continue
        </Button>
      </form>
    );
  }

  if (!question) {
    return (
      <EscalateView
        reason="The assistant could not find a suitable follow-up question. Use the search page or contact your IT team."
        searchHref={`/?q=${encodeURIComponent(problem)}`}
        onRestart={() => window.location.reload()}
      />
    );
  }

  return (
    <form
      onSubmit={(event) => onSubmitAnswer(question.id, event)}
      className="mt-8 space-y-4"
    >
      <label htmlFor="diagnostic-answer" className="block font-medium">
        {question.text}
      </label>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Question {previousAnswers.length + 1} of {MAX_QUESTIONS}
      </p>
      <textarea
        id="diagnostic-answer"
        value={answer}
        onChange={(event) => onAnswerChange(event.target.value)}
        rows={3}
        className="w-full rounded-lg border border-border bg-background p-3 text-foreground outline-none focus:ring-2 focus:ring-ring"
        placeholder="Your answer..."
        disabled={loading}
      />
      <Button type="submit" disabled={!answer.trim() || loading}>
        Continue
      </Button>
    </form>
  );
}

function MatchView({
  output,
  platform,
  onReject,
  searchHref,
  resolutionTrackingEnabled,
  signedIn,
  onStartTicket,
}: {
  output: AiIntakeOutput;
  platform: Platform | null;
  onReject: () => void;
  searchHref: string;
  resolutionTrackingEnabled: boolean;
  signedIn: boolean;
  onStartTicket: (href: string) => void;
}) {
  const effectivePlatform = output.detectedPlatform ?? platform ?? "Other";
  const guideHref = output.matchedIssueSlug
    ? `/issues/${output.matchedIssueSlug}/guide?platform=${encodeURIComponent(effectivePlatform)}`
    : searchHref;

  return (
    <div className="mt-8 space-y-6 rounded-xl border border-border bg-background p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Suggested approved guide</h2>
      <p className="text-muted-foreground">{output.explanation}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href={guideHref}
          onClick={async (event) => {
            void fetch("/api/analytics/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "ai_recommendation_accepted",
                path: guideHref.split("?")[0],
                issueId: output.matchedIssueSlug,
              }),
              keepalive: true,
            }).catch(() => {});
            if (!resolutionTrackingEnabled || !signedIn) return;
            if (!output.matchedIssueSlug) return;
            event.preventDefault();
            const result = await startAiTicket({
              issueId: output.matchedIssueSlug,
              platform: effectivePlatform,
            });
            if ("ticketId" in result) {
              onStartTicket(`${guideHref}&ticket=${result.ticketId}`);
            } else {
              onStartTicket(guideHref);
            }
          }}
          className={cn(buttonVariants({ variant: "default" }))}
        >
          Start approved guide
        </Link>
        <button
          type="button"
          onClick={onReject}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          <XCircle className="mr-2 h-4 w-4" />
          No, this is not right
        </button>
      </div>
      <Link
        href={searchHref}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to search
      </Link>
    </div>
  );
}

function EscalateView({
  reason,
  searchHref,
  onRestart,
}: {
  reason: string;
  searchHref: string;
  onRestart: () => void;
}) {
  return (
    <div className="mt-8 space-y-6 rounded-xl border border-destructive/20 bg-destructive/5 p-6">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        <h2 className="text-xl font-semibold">Contact your IT team</h2>
      </div>
      <p className="text-destructive">{reason}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href={searchHref}
          onClick={() => {
            void fetch("/api/analytics/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "ai_recommendation_rejected",
                path: searchHref.split("?")[0] || "/",
              }),
              keepalive: true,
            }).catch(() => {});
          }}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Search support guides
        </Link>
        <button
          type="button"
          onClick={onRestart}
          className={cn(buttonVariants({ variant: "ghost" }))}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function UnavailableView({
  error,
  onRestart,
  searchHref,
}: {
  error: string;
  onRestart: () => void;
  searchHref: string;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">
        Ask the Support Assistant
      </h1>
      <div className="mt-8 rounded-xl border border-amber-500/20 bg-amber-50 p-6 text-amber-900">
        <p className="font-medium">{error}</p>
        <p className="mt-2 text-sm">
          The support assistant is not enabled right now. You can still search
          the approved guides.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={searchHref}
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Search guides
          </Link>
          <button
            type="button"
            onClick={onRestart}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Try the assistant again
          </button>
        </div>
      </div>
    </div>
  );
}
