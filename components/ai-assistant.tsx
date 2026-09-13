"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
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
import { CATEGORIES } from "@/lib/issues";
import { filterIssues, getIssueBySlug } from "@/lib/search";
import { getIssueSteps } from "@/lib/steps";
import { getIssueStepPolicies, isOfferable } from "@/lib/investigation/policy";
import {
  diagnosticQuestions,
  type AiIntakeOutput,
  type DiagnosticAnswer,
} from "@/lib/ai/types";
import { SAFE_USE_WARNING } from "@/lib/ui-copy";
import { useAssistantIntake } from "@/components/ai-assistant-logic";

export function AiAssistant({
  resolutionTrackingEnabled = false,
  workflowEnabled = false,
  signedIn = false,
  stepPolicyEnabled = false,
}: {
  resolutionTrackingEnabled?: boolean;
  workflowEnabled?: boolean;
  signedIn?: boolean;
  stepPolicyEnabled?: boolean;
}) {
  const {
    problem,
    setProblem,
    platform,
    setPlatform,
    previousAnswers,
    currentOutput,
    loading,
    error,
    started,
    diagnosticAnswer,
    setDiagnosticAnswer,
    restart,
    handleStart: startIntake,
    handleSubmitPlatform: submitPlatform,
    handleSubmitAnswer: submitAnswer,
    handleRejectMatch,
    handleSendToSupport,
    searchHref,
    startAiTicket,
    router,
  } = useAssistantIntake({});

  const statusRef = useRef<HTMLDivElement>(null);

  function handleStart(event: FormEvent) {
    event.preventDefault();
    startIntake(problem);
  }

  function handleSubmitPlatform(event: FormEvent) {
    event.preventDefault();
    if (!platform) return;
    submitPlatform(platform);
  }

  function handleSubmitAnswer(questionId: string, event: FormEvent) {
    event.preventDefault();
    if (!diagnosticAnswer.trim()) return;
    submitAnswer(questionId, diagnosticAnswer);
  }

  if (error) {
    return (
      <UnavailableView
        error={error}
        onRestart={restart}
        searchHref={searchHref()}
        problem={problem}
        platform={platform}
        stepPolicyEnabled={stepPolicyEnabled}
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

      <div className="glass mt-4 border-l-4 border-amber-500 bg-amber-50/60 p-4 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm">{SAFE_USE_WARNING}</p>
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
              className="w-full rounded-2xl border border-border/70 bg-background/60 p-3 text-foreground backdrop-blur outline-none focus:ring-2 focus:ring-ring"
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
            problem={problem}
            previousAnswers={previousAnswers}
            startAiTicket={startAiTicket}
            onStartTicket={(href) => router.push(href)}
          />
        ) : currentOutput?.decision === "escalate" ? (
          <EscalateView
            reason={currentOutput.escalationReason ?? ""}
            suggestedIssueSlugs={currentOutput.suggestedIssueSlugs}
            searchHref={searchHref()}
            onRestart={restart}
            workflowEnabled={workflowEnabled}
            signedIn={signedIn}
            stepPolicyEnabled={stepPolicyEnabled}
            onSendToSupport={handleSendToSupport}
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
            workflowEnabled={workflowEnabled}
            signedIn={signedIn}
            stepPolicyEnabled={stepPolicyEnabled}
            onSendToSupport={handleSendToSupport}
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
            onClick={restart}
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
  workflowEnabled,
  signedIn,
  stepPolicyEnabled,
  onSendToSupport,
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
  workflowEnabled: boolean;
  signedIn: boolean;
  stepPolicyEnabled: boolean;
  onSendToSupport: () => Promise<{ error?: string }>;
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
                  "glass flex cursor-pointer items-center gap-3 p-4",
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
        suggestedIssueSlugs={output.suggestedIssueSlugs}
        searchHref={`/?q=${encodeURIComponent(problem)}`}
        onRestart={() => window.location.reload()}
        workflowEnabled={workflowEnabled}
        signedIn={signedIn}
        stepPolicyEnabled={stepPolicyEnabled}
        onSendToSupport={onSendToSupport}
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
        Question {previousAnswers.length + 1} of 3
      </p>
      <textarea
        id="diagnostic-answer"
        value={answer}
        onChange={(event) => onAnswerChange(event.target.value)}
        rows={3}
        className="w-full rounded-2xl border border-border/70 bg-background/60 p-3 text-foreground backdrop-blur outline-none focus:ring-2 focus:ring-ring"
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
  problem,
  previousAnswers,
  startAiTicket,
  onStartTicket,
}: {
  output: AiIntakeOutput;
  platform: Platform | null;
  onReject: () => void;
  searchHref: string;
  resolutionTrackingEnabled: boolean;
  signedIn: boolean;
  problem: string;
  previousAnswers: DiagnosticAnswer[];
  startAiTicket: typeof import("@/app/actions/resolution").startAiTicket;
  onStartTicket: (href: string) => void;
}) {
  const effectivePlatform = output.detectedPlatform ?? platform ?? "Other";
  const guideHref = output.matchedIssueSlug
    ? `/issues/${output.matchedIssueSlug}/guide?platform=${encodeURIComponent(effectivePlatform)}`
    : searchHref;

  return (
    <div className="glass-strong mt-8 space-y-6 p-6">
      <h2 className="text-xl font-semibold">Suggested approved guide</h2>
      {output.hypotheses && output.hypotheses.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium">Likely causes</h3>
          {output.hypotheses.map((hypothesis) => (
            <div key={`${hypothesis.cause}-${hypothesis.guideSlug ?? "none"}`}>
              <div className="flex items-center justify-between text-sm">
                <span>{hypothesis.cause}</span>
                <span>{Math.round(hypothesis.confidence * 100)}%</span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={Math.round(hypothesis.confidence * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.round(hypothesis.confidence * 100)}%`,
                  }}
                />
              </div>
              <details className="mt-2 text-sm text-muted-foreground">
                <summary className="cursor-pointer">Why</summary>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  {hypothesis.evidence.map((evidence) => (
                    <li key={evidence}>“{evidence}”</li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      )}
      <p className="text-muted-foreground">{output.explanation}</p>
      {output.citation && (
        <p className="text-sm text-muted-foreground">
          Source:{" "}
          {output.citation.url ? (
            <a
              href={output.citation.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {output.citation.title}
            </a>
          ) : (
            output.citation.title
          )}{" "}
          · v{output.citation.version} · updated{" "}
          {output.citation.retrievedAt
            ? new Date(output.citation.retrievedAt).toLocaleDateString()
            : "unknown"}{" "}
          · {output.citation.supportedPlatforms.join(", ")}
        </p>
      )}
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
              message: problem,
              diagnosticAnswers: previousAnswers,
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
      {output.suggestedIssueSlugs && output.suggestedIssueSlugs.length > 0 && (
        <div className="border-t border-border/60 pt-4">
          <p className="text-sm font-medium">Other possible matches</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {output.suggestedIssueSlugs.map((slug) => {
              const issue = getIssueBySlug(slug);
              if (!issue) return null;
              return (
                <li key={slug}>
                  <Link
                    href={`/issues/${slug}/guide`}
                    className="text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    {issue.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function EscalateView({
  reason,
  suggestedIssueSlugs = [],
  searchHref,
  onRestart,
  workflowEnabled = false,
  signedIn = false,
  stepPolicyEnabled = false,
  onSendToSupport,
}: {
  reason: string;
  suggestedIssueSlugs?: string[];
  searchHref: string;
  onRestart: () => void;
  workflowEnabled?: boolean;
  signedIn?: boolean;
  stepPolicyEnabled?: boolean;
  onSendToSupport?: () => Promise<{ error?: string }>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestions = suggestedIssueSlugs
    .map((slug) => getIssueBySlug(slug))
    .filter((issue): issue is NonNullable<typeof issue> => Boolean(issue));
  const hasSuggestions = suggestions.length > 0;

  async function sendToSupport() {
    if (!onSendToSupport) return;
    setPending(true);
    setError(null);
    try {
      const result = await onSendToSupport();
      if (result.error) setError(result.error);
    } catch {
      setError("Unable to submit ticket.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn(
        "glass-strong mt-8 space-y-6 p-6",
        hasSuggestions
          ? "border-primary/20 bg-primary/5"
          : "border-destructive/20 bg-destructive/5"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          hasSuggestions ? "text-foreground" : "text-destructive"
        )}
      >
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        <h2 className="text-xl font-semibold">
          {hasSuggestions ? "Here's what I found" : "Contact your IT team"}
        </h2>
      </div>
      <p
        className={
          hasSuggestions ? "text-muted-foreground" : "text-destructive"
        }
      >
        {reason}
      </p>
      {hasSuggestions && (
        <div>
          <h3 className="font-medium">Suggested guides</h3>
          <div className="mt-3 space-y-3">
            {suggestions.map((issue) => {
              const category =
                CATEGORIES.find((item) => item.id === issue.category)?.label ??
                issue.category;
              return (
                <article
                  key={issue.id}
                  className="rounded-2xl border border-border/60 p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="font-semibold">{issue.title}</h4>
                    <span className="text-xs text-muted-foreground">
                      {category}
                    </span>
                  </div>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    {(stepPolicyEnabled
                      ? getIssueStepPolicies(issue)
                          .filter((step) => isOfferable(step.risk, "requester"))
                          .map((step) => step.text)
                      : getIssueSteps(issue)
                    )
                      .slice(0, 3)
                      .map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                  </ol>
                  <Link
                    href={`/issues/${issue.id}/guide`}
                    className="mt-3 inline-flex text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    Open full guide
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {workflowEnabled && signedIn ? (
          <Button
            type="button"
            onClick={() => void sendToSupport()}
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send to a support person
          </Button>
        ) : workflowEnabled ? (
          <Link
            href="/login?next=/assistant"
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Log in to send this to a support person
          </Link>
        ) : null}
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
  problem,
  platform,
  stepPolicyEnabled,
}: {
  error: string;
  onRestart: () => void;
  searchHref: string;
  problem: string;
  platform: Platform | null;
  stepPolicyEnabled: boolean;
}) {
  const suggestions = filterIssues({ query: problem, platform }).slice(0, 3);
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">
        Ask the Support Assistant
      </h1>
      <div className="glass-strong mt-8 border-amber-500/20 bg-amber-50/60 p-6 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <p className="font-medium">{error}</p>
        {suggestions.length > 0 && (
          <div className="mt-4 space-y-3">
            <h2 className="font-medium">Suggested guides</h2>
            {suggestions.map((issue) => (
              <article
                key={issue.id}
                className="rounded-2xl border border-border/60 p-4"
              >
                <h3 className="font-semibold">{issue.title}</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  {(stepPolicyEnabled
                    ? getIssueStepPolicies(issue)
                        .filter((step) => isOfferable(step.risk, "requester"))
                        .map((step) => step.text)
                    : getIssueSteps(issue)
                  )
                    .slice(0, 3)
                    .map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                </ol>
                <Link
                  href={`/issues/${issue.id}/guide`}
                  className="mt-3 inline-flex text-sm font-medium text-primary underline underline-offset-4"
                >
                  Open full guide
                </Link>
              </article>
            ))}
          </div>
        )}
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
