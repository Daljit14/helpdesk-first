"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { Bot, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { getIssueBySlug } from "@/lib/search";
import {
  getIssueStepPolicies,
  isOfferable,
  riskLabel,
} from "@/lib/investigation/policy";
import { type Platform } from "@/lib/helpdesk-data";
import type { AiIntakeOutput } from "@/lib/ai/types";
import { diagnosticQuestions } from "@/lib/ai/types";
import { recordStepOutcome } from "@/app/actions/tickets";
import { useAssistantIntake } from "@/components/ai-assistant-logic";
import { SAFE_USE_WARNING } from "@/lib/ui-copy";

type StepOutcome = "worked" | "failed" | "could_not_perform";

const progress = [
  "Understanding",
  "Clarifying",
  "Likely causes",
  "Steps",
  "Verify",
];

export function AssistantWorkspace({
  initialProblem = "",
  initialPlatform = null,
  intent,
  attach = false,
  autoStart = false,
  resolutionTrackingEnabled = false,
  workflowEnabled = false,
  signedIn = false,
  stepPolicyEnabled = false,
}: {
  initialProblem?: string;
  initialPlatform?: Platform | null;
  intent?: string;
  attach?: boolean;
  autoStart?: boolean;
  resolutionTrackingEnabled?: boolean;
  workflowEnabled?: boolean;
  signedIn?: boolean;
  stepPolicyEnabled?: boolean;
}) {
  const intake = useAssistantIntake({
    initialProblem,
    initialPlatform,
    autoStart,
  });
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, StepOutcome>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = window.sessionStorage.getItem("hf-v2-outcomes");
      return saved ? (JSON.parse(saved) as Record<string, StepOutcome>) : {};
    } catch {
      return {};
    }
  });
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const autoStarted = useRef(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const ticketIntent = intent === "ticket" || intent === "human";

  useEffect(() => {
    try {
      sessionStorage.setItem("hf-v2-outcomes", JSON.stringify(outcomes));
    } catch {}
  }, [outcomes]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const updateHeight = () =>
      setComposerHeight(composer.getBoundingClientRect().height);
    updateHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(composer);
    return () => observer.disconnect();
  }, [
    ticketIntent,
    attachmentName,
    intake.platform,
    intake.previousAnswers.length,
  ]);

  useEffect(() => {
    if (!attach) return;
    try {
      const saved = sessionStorage.getItem("hf-v2-start");
      if (saved) {
        const value = JSON.parse(saved) as { fileName?: string };
        queueMicrotask(() =>
          setAttachmentName(value.fileName ?? "Attachment selected")
        );
      } else {
        queueMicrotask(() => setAttachmentName("Attachment selected"));
      }
    } catch {
      queueMicrotask(() => setAttachmentName("Attachment selected"));
    }
  }, [attach]);

  useEffect(() => {
    if (autoStart && initialProblem && !ticketIntent && !autoStarted.current) {
      autoStarted.current = true;
      void intake.submitIntake(initialProblem, initialPlatform, [], true);
    }
  }, [autoStart, initialPlatform, initialProblem, intake, ticketIntent]);

  const sendToSupport = async () => {
    setActionError(null);
    setActionPending(true);
    try {
      const result = await intake.handleSendToSupport(ticketMessage);
      if ("error" in result)
        setActionError(result.error ?? "Unable to submit ticket.");
    } catch {
      setActionError("Unable to submit ticket.");
    } finally {
      setActionPending(false);
    }
  };

  const output = intake.currentOutput;
  const matchedIssue = output?.matchedIssueSlug
    ? getIssueBySlug(output.matchedIssueSlug)
    : null;
  const policySteps = useMemo(() => {
    if (!matchedIssue) return [];
    const policies = getIssueStepPolicies(matchedIssue);
    return stepPolicyEnabled
      ? policies.filter((step) => isOfferable(step.risk, "requester"))
      : policies;
  }, [matchedIssue, stepPolicyEnabled]);
  const triedSteps = useMemo(
    () =>
      policySteps.filter((step) =>
        ["failed", "could_not_perform"].includes(
          outcomes[`${matchedIssue?.id}:${step.stepIndex}`]
        )
      ),
    [matchedIssue?.id, outcomes, policySteps]
  );
  const offeredSteps = useMemo(
    () =>
      policySteps
        .filter(
          (step) =>
            !["failed", "could_not_perform"].includes(
              outcomes[`${matchedIssue?.id}:${step.stepIndex}`]
            )
        )
        .slice(0, 5),
    [matchedIssue?.id, outcomes, policySteps]
  );
  const allStepsFailed =
    policySteps.length > 0 &&
    policySteps.every((step) =>
      ["failed", "could_not_perform"].includes(
        outcomes[`${matchedIssue?.id}:${step.stepIndex}`]
      )
    );
  const ticketMessage =
    triedSteps.length && matchedIssue
      ? `${intake.problem}\n\nSteps tried from "${matchedIssue.title}":\n${triedSteps
          .map(
            (step) =>
              `- ${step.text}: ${outcomes[`${matchedIssue.id}:${step.stepIndex}`]}`
          )
          .join("\n")}`
      : undefined;
  const loginHref = loginLink(intake.problem, intake.platform, intent);
  const withheld =
    Boolean(output?.withheldSteps?.length) ||
    Boolean(
      matchedIssue &&
      stepPolicyEnabled &&
      getIssueStepPolicies(matchedIssue).some(
        (step) => !isOfferable(step.risk, "requester")
      )
    );

  const guideHref = matchedIssue
    ? `/issues/${matchedIssue.id}/guide?platform=${encodeURIComponent(output?.detectedPlatform ?? intake.platform ?? "Other")}`
    : intake.searchHref();

  const handleStartGuide = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!resolutionTrackingEnabled || !signedIn || !matchedIssue) return;
    event.preventDefault();
    setActionError(null);
    setActionPending(true);
    try {
      const result = await intake.startAiTicket({
        issueId: matchedIssue.id,
        platform: output?.detectedPlatform ?? intake.platform ?? "Other",
        message: intake.problem,
        diagnosticAnswers: intake.previousAnswers,
      });
      if ("ticketId" in result && result.ticketId) {
        setTicketId(result.ticketId);
        intake.router.push(`${guideHref}&ticket=${result.ticketId}`);
      } else if ("error" in result) {
        setActionError(result.error ?? "Unable to start the approved guide.");
      }
    } catch {
      setActionError("Unable to start the approved guide.");
    } finally {
      setActionPending(false);
    }
  };

  const handleOutcome = async (stepIndex: number, outcome: StepOutcome) => {
    if (!matchedIssue) return;
    const key = `${matchedIssue.id}:${stepIndex}`;
    setOutcomes((current) => ({ ...current, [key]: outcome }));
    setActionError(null);
    if (!ticketId) return;
    setActionPending(true);
    try {
      const result = await recordStepOutcome(
        ticketId,
        matchedIssue.id,
        stepIndex,
        outcome
      );
      if ("error" in result)
        setActionError(result.error ?? "Unable to record step outcome.");
    } catch {
      setActionError("Unable to record step outcome.");
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-3xl flex-col">
      <div className="mb-6 flex items-center gap-3">
        <Bot className="h-7 w-7" aria-hidden />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Support Assistant
          </h1>
          <p className="text-sm text-muted-foreground">
            Grounded in approved HelpDesk First guides.
          </p>
        </div>
      </div>

      <ol
        aria-label="Investigation progress"
        className="mb-6 grid grid-cols-5 gap-1 text-center text-[11px] text-muted-foreground"
      >
        {progress.map((label, index) => {
          const current =
            output?.decision === "match"
              ? index >= 2 && index <= 3
              : index === 0;
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={cn(
                "border-b-2 pb-2",
                current ? "border-foreground text-foreground" : "border-border"
              )}
            >
              {label}
            </li>
          );
        })}
      </ol>

      <div
        className="flex-1 space-y-5"
        style={{
          paddingBottom: composerHeight ? `${composerHeight + 24}px` : "12rem",
        }}
      >
        {initialProblem && <Message side="user" text={initialProblem} />}
        {ticketIntent ? (
          <div className="space-y-4">
            <Message
              side="assistant"
              text="I have your description. A support person can take it from here."
            />
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-semibold">
                Send this problem to your IT team
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {initialProblem}
              </p>
              {workflowEnabled && signedIn ? (
                <Button
                  className="mt-4"
                  onClick={() => void sendToSupport()}
                  disabled={actionPending}
                >
                  Send to a support person
                </Button>
              ) : workflowEnabled ? (
                <Link
                  href={loginHref}
                  className={cn(buttonVariants({ variant: "default" }), "mt-4")}
                >
                  Log in to send this to a support person
                </Link>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Ticket creation is not available right now.
                </p>
              )}
              {actionError && <ActionError error={actionError} />}
            </section>
          </div>
        ) : (
          <>
            {intake.loading && (
              <div
                aria-live="polite"
                className="rounded-2xl border border-border bg-card p-4 text-muted-foreground"
              >
                <Loader2
                  className="mr-2 inline h-4 w-4 animate-spin"
                  aria-hidden
                />
                Assistant is thinking…
              </div>
            )}
            {output?.decision === "clarify" && (
              <Message side="assistant" text={clarificationText(output)} />
            )}
            {output?.decision === "escalate" && (
              <Escalation
                output={output}
                signedIn={signedIn}
                workflowEnabled={workflowEnabled}
                onSend={sendToSupport}
                searchHref={intake.searchHref()}
                loginHref={loginHref}
                actionError={actionError}
                actionPending={actionPending}
              />
            )}
            {output?.decision === "match" && (
              <Match
                output={output}
                guideHref={guideHref}
                guideTitle={matchedIssue?.title ?? "Approved support guide"}
                steps={offeredSteps}
                triedSteps={triedSteps}
                outcomes={outcomes}
                withheld={withheld}
                stepPolicyEnabled={stepPolicyEnabled}
                actionError={actionError}
                actionPending={actionPending}
                allStepsFailed={allStepsFailed}
                onOutcome={handleOutcome}
                onStartGuide={handleStartGuide}
                onSend={sendToSupport}
                signedIn={signedIn}
                workflowEnabled={workflowEnabled}
                searchHref={intake.searchHref()}
                loginHref={loginHref}
                ticketId={ticketId}
              />
            )}
            {intake.error && (
              <div
                role="alert"
                className="rounded-2xl border border-border bg-card p-5"
              >
                <p>{intake.error}</p>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => void intake.submitIntake()}
                >
                  Retry
                </Button>
              </div>
            )}
            {!output && !intake.loading && !initialProblem && (
              <Message
                side="assistant"
                text="Describe your IT problem below and I’ll help find an approved guide."
              />
            )}
          </>
        )}
      </div>

      {!ticketIntent && (
        <div
          ref={composerRef}
          className="sticky bottom-0 mt-8 border-t border-border bg-background/95 pt-4 [padding-bottom:env(safe-area-inset-bottom)]"
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {intake.platform && (
              <button
                type="button"
                className="v2-badge"
                onClick={() => intake.setPlatform(null)}
              >
                {intake.platform} ×
              </button>
            )}
            {attachmentName && (
              <span className="v2-badge">
                <Paperclip className="h-3 w-3" aria-hidden /> {attachmentName}
              </span>
            )}
            {output?.decision === "clarify" && (
              <span className="v2-badge">
                Question {intake.previousAnswers.length + 1} of 3
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <textarea
              aria-label="Describe your IT problem"
              value={
                intake.diagnosticAnswer ||
                (!intake.started ? intake.problem : "")
              }
              onChange={(event) =>
                output?.decision === "clarify"
                  ? intake.setDiagnosticAnswer(event.target.value)
                  : intake.setProblem(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey) return;
                event.preventDefault();
                if (output?.decision === "clarify") {
                  const questionId = output.diagnosticQuestionIds?.[0];
                  if (questionId)
                    intake.handleSubmitAnswer(
                      questionId,
                      intake.diagnosticAnswer
                    );
                } else if (intake.problem.trim()) {
                  intake.handleStart(intake.problem);
                }
              }}
              rows={2}
              placeholder={
                output?.decision === "clarify"
                  ? "Answer the question…"
                  : "Describe your IT problem…"
              }
              className="min-h-11 flex-1 resize-none rounded-xl border border-input bg-card p-3 outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              className="v2-touch self-end"
              onClick={() => {
                if (output?.decision === "clarify") {
                  const questionId = output.diagnosticQuestionIds?.[0];
                  if (questionId)
                    intake.handleSubmitAnswer(
                      questionId,
                      intake.diagnosticAnswer
                    );
                } else {
                  intake.handleStart(intake.problem);
                }
              }}
            >
              Send
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{SAFE_USE_WARNING}</p>
            {workflowEnabled && signedIn ? (
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => void sendToSupport()}
                disabled={actionPending}
              >
                I want a person
              </Button>
            ) : workflowEnabled ? (
              <Link
                href={loginHref}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "shrink-0"
                )}
              >
                I want a person
              </Link>
            ) : null}
          </div>
          {actionError && <ActionError error={actionError} />}
        </div>
      )}
    </div>
  );
}

function Message({ side, text }: { side: "user" | "assistant"; text: string }) {
  return (
    <div
      className={cn("flex", side === "user" ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl border border-border p-4",
          side === "user" ? "bg-card" : "bg-muted"
        )}
      >
        <p className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {side === "assistant" ? (
            <Bot className="h-4 w-4" aria-hidden />
          ) : null}
          {side === "user" ? "You" : "Assistant"}
        </p>
        <p className="whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

function clarificationText(output: AiIntakeOutput) {
  const id = output.diagnosticQuestionIds?.[0];
  return (
    diagnosticQuestions.find((question) => question.id === id)?.text ??
    "Tell me a little more about what happened."
  );
}

function Match({
  output,
  guideHref,
  guideTitle,
  steps,
  triedSteps,
  outcomes,
  withheld,
  stepPolicyEnabled,
  actionError,
  actionPending,
  allStepsFailed,
  onOutcome,
  onStartGuide,
  onSend,
  signedIn,
  workflowEnabled,
  searchHref,
  loginHref,
  ticketId,
}: {
  output: AiIntakeOutput;
  guideHref: string;
  guideTitle: string;
  steps: ReturnType<typeof getIssueStepPolicies>;
  triedSteps: ReturnType<typeof getIssueStepPolicies>;
  outcomes: Record<string, StepOutcome>;
  withheld: boolean;
  stepPolicyEnabled: boolean;
  actionError: string | null;
  actionPending: boolean;
  allStepsFailed: boolean;
  onOutcome: (stepIndex: number, outcome: StepOutcome) => void;
  onStartGuide: (event: MouseEvent<HTMLAnchorElement>) => void;
  onSend: () => Promise<void>;
  signedIn: boolean;
  workflowEnabled: boolean;
  searchHref: string;
  loginHref: string;
  ticketId: string | null;
}) {
  const matchedGuideTitle = output.citation?.title ?? guideTitle;
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <Message
        side="assistant"
        text={output.explanation ?? "I found an approved guide that may help."}
      />
      {output.hypotheses && output.hypotheses.length > 0 && (
        <div>
          <h2 className="font-semibold">Likely causes</h2>
          <div className="mt-3 space-y-3">
            {output.hypotheses.map((hypothesis) => (
              <div key={hypothesis.cause}>
                <div className="flex justify-between text-sm">
                  <span>{hypothesis.cause}</span>
                  <span>
                    {Math.round(hypothesis.confidence * 100)}% confidence
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground"
                    style={{ width: `${hypothesis.confidence * 100}%` }}
                  />
                </div>
                <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                  {hypothesis.evidence.map((evidence) => (
                    <li key={evidence}>{evidence}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <h2 className="font-semibold">Sources</h2>
        <Link
          className="mt-1 inline-block underline underline-offset-4"
          href={output.citation?.url ?? guideHref}
        >
          {matchedGuideTitle}
        </Link>
      </div>
      {steps.length > 0 && (
        <div>
          <h2 className="font-semibold">Suggested steps</h2>
          <div className="mt-3 space-y-3">
            {steps.map((step) => (
              <div
                key={`${step.stepIndex}-${step.text}`}
                className="rounded-xl border border-border p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">{step.text}</span>
                  <span className="v2-badge">{riskLabel(step.risk)}</span>
                </div>
                {outcomes[`${output.matchedIssueSlug}:${step.stepIndex}`] && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Outcome:{" "}
                    {outcomes[`${output.matchedIssueSlug}:${step.stepIndex}`]}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["Worked", "worked"],
                      ["Did not work", "failed"],
                      ["Cannot complete", "could_not_perform"],
                    ] as const
                  ).map(([label, outcome]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={
                        outcomes[
                          `${output.matchedIssueSlug}:${step.stepIndex}`
                        ] === outcome
                      }
                      disabled={actionPending}
                      onClick={() => void onOutcome(step.stepIndex, outcome)}
                      className="rounded-lg border border-border px-2 py-1 text-xs"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {withheld && stepPolicyEnabled && (
            <p className="mt-3 text-sm text-muted-foreground">
              Some steps require IT approval and were withheld.
            </p>
          )}
        </div>
      )}
      {triedSteps.length > 0 && (
        <details className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer font-medium">
            Already tried
          </summary>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {triedSteps.map((step) => (
              <li key={`${step.stepIndex}-${step.text}`}>
                <span>{step.text}</span>
                <span className="ml-2">
                  Outcome:{" "}
                  {outcomes[`${output.matchedIssueSlug}:${step.stepIndex}`]}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {steps.some(
        (step) =>
          outcomes[`${output.matchedIssueSlug}:${step.stepIndex}`] === "worked"
      ) && (
        <div className="rounded-xl border border-border bg-muted p-4">
          <p className="font-medium">
            That step may have resolved the problem.
          </p>
          {ticketId && (
            <Link
              href={`/tickets/${ticketId}`}
              className="mt-2 inline-block underline underline-offset-4"
            >
              Review and confirm resolution
            </Link>
          )}
        </div>
      )}
      {allStepsFailed && (
        <Escalation
          output={output}
          signedIn={signedIn}
          workflowEnabled={workflowEnabled}
          onSend={onSend}
          searchHref={searchHref}
          loginHref={loginHref}
          actionError={actionError}
          actionPending={actionPending}
          prominent
        />
      )}
      <Link
        href={guideHref}
        onClick={onStartGuide}
        aria-disabled={actionPending || undefined}
        className={cn(buttonVariants({ variant: "default" }))}
      >
        Start approved guide
      </Link>
      {actionError && !allStepsFailed && <ActionError error={actionError} />}
    </section>
  );
}

function Escalation({
  output,
  signedIn,
  workflowEnabled,
  onSend,
  searchHref,
  loginHref,
  actionError,
  actionPending,
  prominent = false,
}: {
  output: AiIntakeOutput;
  signedIn: boolean;
  workflowEnabled: boolean;
  onSend: () => Promise<void>;
  searchHref: string;
  loginHref: string;
  actionError: string | null;
  actionPending: boolean;
  prominent?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5",
        prominent && "border-foreground ring-2 ring-foreground/20"
      )}
    >
      {prominent && (
        <h2 className="mb-3 text-lg font-semibold">
          Create a support ticket with this history
        </h2>
      )}
      <Message
        side="assistant"
        text={
          output.escalationReason ??
          "Contact your IT team for help with this problem."
        }
      />
      <div className="mt-4 flex flex-wrap gap-3">
        {workflowEnabled && signedIn ? (
          <Button onClick={() => void onSend()} disabled={actionPending}>
            {prominent
              ? "Create a support ticket with this history"
              : "Send to a support person"}
          </Button>
        ) : workflowEnabled ? (
          <Link
            href={loginHref}
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Log in to send this to a support person
          </Link>
        ) : null}
        <Link
          href={searchHref}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Search support guides
        </Link>
      </div>
      {actionError && <ActionError error={actionError} />}
    </section>
  );
}

function ActionError({ error }: { error: string }) {
  return (
    <div role="alert" className="mt-3 rounded-xl border border-destructive p-3">
      {error}
    </div>
  );
}

function loginLink(
  problem: string,
  platform: Platform | null,
  intent: string | undefined
) {
  const next = new URLSearchParams({ q: problem, intent: intent ?? "human" });
  if (platform) next.set("platform", platform);
  return `/login?next=${encodeURIComponent(`/assistant?${next.toString()}`)}`;
}
