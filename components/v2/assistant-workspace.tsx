"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useAssistantIntake } from "@/components/ai-assistant-logic";
import { SAFE_USE_WARNING } from "@/lib/ui-copy";

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
  const autoStarted = useRef(false);
  const ticketIntent = intent === "ticket" || intent === "human";

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
    await intake.handleSendToSupport();
  };

  const output = intake.currentOutput;
  const matchedIssue = output?.matchedIssueSlug
    ? getIssueBySlug(output.matchedIssueSlug)
    : null;
  const offeredSteps = useMemo(() => {
    if (!matchedIssue) return [];
    const policies = getIssueStepPolicies(matchedIssue);
    return (
      stepPolicyEnabled
        ? policies.filter((step) => isOfferable(step.risk, "requester"))
        : policies
    ).slice(0, 5);
  }, [matchedIssue, stepPolicyEnabled]);
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

      <div className="flex-1 space-y-5 pb-48">
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
                <Button className="mt-4" onClick={() => void sendToSupport()}>
                  Send to a support person
                </Button>
              ) : workflowEnabled ? (
                <Link
                  href={`/login?next=${encodeURIComponent(`/assistant?q=${initialProblem}&intent=${intent}`)}`}
                  className={cn(buttonVariants({ variant: "default" }), "mt-4")}
                >
                  Log in to send this to a support person
                </Link>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  Ticket creation is not available right now.
                </p>
              )}
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
              />
            )}
            {output?.decision === "match" && (
              <Match
                output={output}
                guideHref={guideHref}
                steps={offeredSteps}
                withheld={withheld}
                stepPolicyEnabled={stepPolicyEnabled}
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
        <div className="sticky bottom-0 mt-8 border-t border-border bg-background/95 pt-4 [padding-bottom:env(safe-area-inset-bottom)]">
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
              >
                I want a person
              </Button>
            ) : workflowEnabled ? (
              <Link
                href="/login?next=/assistant"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "shrink-0"
                )}
              >
                I want a person
              </Link>
            ) : null}
          </div>
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
  steps,
  withheld,
  stepPolicyEnabled,
}: {
  output: AiIntakeOutput;
  guideHref: string;
  steps: ReturnType<typeof getIssueStepPolicies>;
  withheld: boolean;
  stepPolicyEnabled: boolean;
}) {
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
      {output.citation && (
        <div>
          <h2 className="font-semibold">Sources</h2>
          <Link
            className="mt-1 inline-block underline underline-offset-4"
            href={output.citation.url ?? guideHref}
          >
            {output.citation.title}
          </Link>
        </div>
      )}
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {["Worked", "Did not work", "Cannot complete"].map(
                    (label) => (
                      <Link
                        key={label}
                        href={guideHref}
                        className="rounded-lg border border-border px-2 py-1 text-xs"
                      >
                        {label}
                      </Link>
                    )
                  )}
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
      <Link
        href={guideHref}
        className={cn(buttonVariants({ variant: "default" }))}
      >
        Start approved guide
      </Link>
    </section>
  );
}

function Escalation({
  output,
  signedIn,
  workflowEnabled,
  onSend,
  searchHref,
}: {
  output: AiIntakeOutput;
  signedIn: boolean;
  workflowEnabled: boolean;
  onSend: () => Promise<void>;
  searchHref: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <Message
        side="assistant"
        text={
          output.escalationReason ??
          "Contact your IT team for help with this problem."
        }
      />
      <div className="mt-4 flex flex-wrap gap-3">
        {workflowEnabled && signedIn ? (
          <Button onClick={() => void onSend()}>
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
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Search support guides
        </Link>
      </div>
    </section>
  );
}
