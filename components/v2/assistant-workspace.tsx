"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { Bot, Headset, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/assistant/composer";
import { ProgressStepper } from "@/components/assistant/progress-stepper";
import { Avatar } from "@/components/avatar/avatar";
import {
  TypewriterText,
  TypingIndicator,
} from "@/components/assistant/typewriter-text";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { platformSlug } from "@/lib/platform";
import { getIssueBySlug } from "@/lib/search";
import {
  getIssueStepPolicies,
  isOfferable,
  riskLabel,
} from "@/lib/investigation/policy";
import { type Platform } from "@/lib/helpdesk-data";
import type { AiIntakeOutput } from "@/lib/ai/types";
import { diagnosticQuestions } from "@/lib/ai/types";
import {
  MAX_ANSWER_LENGTH,
  MAX_CUMULATIVE_TEXT_LENGTH,
  MAX_MESSAGE_LENGTH,
} from "@/lib/ai/validation";
import { recordStepOutcome } from "@/app/actions/tickets";
import { useAssistantIntake } from "@/components/ai-assistant-logic";
import { SAFE_USE_WARNING } from "@/lib/ui-copy";
import {
  AssistantNotice,
  ExampleChips,
  type AssistantNoticeData,
} from "@/components/assistant/input-notice";
import { classifyInput, inputHint } from "@/lib/assistant/input-quality";
import { matchGuides } from "@/lib/assistant/guide-match";
import { noticeText } from "@/lib/assistant/replies";
import { AnswerCard } from "@/components/v2/answer-card";
import type { AnswerCard as AnswerCardData } from "@/lib/answers/present";

type StepOutcome = "worked" | "failed" | "could_not_perform";
const OUTCOME_LABELS: Record<StepOutcome, string> = {
  worked: "Worked",
  failed: "Did not work",
  could_not_perform: "Cannot complete",
};

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
  answerEngineAvailable = false,
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
  answerEngineAvailable?: boolean;
}) {
  const intake = useAssistantIntake({
    initialProblem,
    initialPlatform,
    autoStart,
  });
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, StepOutcome>>({});
  const [outcomeScope, setOutcomeScope] = useState(() =>
    autoStart && initialProblem ? initialProblem.trim() : ""
  );
  const [outcomesLoaded, setOutcomesLoaded] = useState(false);
  const outcomesDirty = useRef(false);
  const focusComposerAfterLoad = useRef(false);

  useEffect(() => {
    let restored: Record<string, StepOutcome> | undefined;
    if (autoStart && initialProblem) {
      try {
        const saved = sessionStorage.getItem("hf-v2-outcomes");
        const value = saved
          ? (JSON.parse(saved) as {
              scope?: unknown;
              outcomes?: unknown;
            } | null)
          : null;
        if (
          value?.scope === initialProblem.trim() &&
          value.outcomes !== null &&
          typeof value.outcomes === "object" &&
          !Array.isArray(value.outcomes)
        ) {
          restored = value.outcomes as Record<string, StepOutcome>;
        }
      } catch {}
    }
    queueMicrotask(() => {
      if (!outcomesDirty.current && restored) setOutcomes(restored);
      setOutcomesLoaded(true);
    });
  }, [autoStart, initialProblem]);

  const [ticketId, setTicketId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  // Ordered chat transcript so questions and answers interleave correctly.
  const [transcript, setTranscript] = useState<ChatTurn[]>(() =>
    initialTranscript(initialProblem)
  );
  const noticeIdSequence = useRef(0);
  const userTurns = transcript
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.text);
  const autoStarted = useRef(false);
  const ticketIntent =
    (intent === "ticket" || intent === "human") &&
    Boolean(initialProblem.trim());

  const lookupAnswer = useCallback(
    (noticeId: string, problem: string, platform: Platform | null) => {
      if (!answerEngineAvailable) return;
      void (async () => {
        let update: Partial<ChatTurn> = {
          answerLoading: false,
          answerRateLimited: false,
        };
        try {
          const response = await fetch("/api/answers", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ problem, platform }),
          });
          if (response.status === 429) {
            update = { answerLoading: false, answerRateLimited: true };
          } else if (response.ok) {
            const card = answerCardFromResponse(await response.json());
            if (card) update = { answerLoading: false, answerCard: card };
          }
        } catch {}
        setTranscript((current) =>
          current.map((turn) =>
            turn.id === noticeId ? { ...turn, ...update } : turn
          )
        );
      })();
    },
    [answerEngineAvailable]
  );

  useEffect(() => {
    if (!outcomesLoaded || !outcomesDirty.current) return;
    try {
      sessionStorage.setItem(
        "hf-v2-outcomes",
        JSON.stringify({ scope: outcomeScope, outcomes })
      );
      outcomesDirty.current = false;
    } catch {}
  }, [outcomeScope, outcomes, outcomesLoaded]);

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
    if (intake.loading || !focusComposerAfterLoad.current) return;
    document.getElementById("assistant-input")?.focus();
    focusComposerAfterLoad.current = false;
  }, [intake.loading]);

  useEffect(() => {
    if (autoStart && initialProblem && !ticketIntent && !autoStarted.current) {
      autoStarted.current = true;
      // Screen the linked problem the same way as typed input: greetings,
      // mashing, secrets and unsupported problems get a local reply.
      const notice = preflightNotice(initialProblem);
      if (notice) {
        const noticeId = `n-${noticeIdSequence.current++}`;
        queueMicrotask(() => {
          if (notice.kind === "sensitive") intake.setProblem("");
          setTranscript((current) => [
            ...current,
            {
              id: noticeId,
              role: "assistant",
              text: notice.text,
              notice,
              answerLoading:
                answerEngineAvailable && notice.kind === "no_match",
            },
          ]);
          if (notice.kind === "no_match")
            lookupAnswer(noticeId, initialProblem, initialPlatform);
        });
        return;
      }
      void intake.submitIntake(initialProblem, initialPlatform, [], true);
    }
  }, [
    answerEngineAvailable,
    autoStart,
    initialPlatform,
    initialProblem,
    intake,
    lookupAnswer,
    ticketIntent,
  ]);

  const sendToSupport = async (messageOverride?: string) => {
    setActionError(null);
    const message = messageOverride ?? ticketMessage ?? intake.problem;
    if (!message.trim()) {
      setActionError("Describe your problem first, then send it to a person.");
      document.getElementById("assistant-input")?.focus();
      return;
    }
    const quality = classifyInput(message);
    if (quality.kind === "sensitive") {
      intake.setProblem("");
      const notice = preflightNotice(message);
      if (notice) pushNotice(notice);
      return;
    }
    setActionPending(true);
    try {
      const result = await intake.handleSendToSupport(message);
      if ("error" in result)
        setActionError(result.error ?? "Unable to submit ticket.");
    } catch {
      setActionError("Unable to submit ticket.");
    } finally {
      setActionPending(false);
    }
  };

  const pushNotice = (
    notice: AssistantNoticeData,
    userText?: string,
    answerNotice = false
  ) => {
    const noticeId = `n-${noticeIdSequence.current++}`;
    setTranscript((current) => {
      const next = [...current];
      if (userText)
        next.push({ id: `u-${next.length}`, role: "user", text: userText });
      next.push({
        id: noticeId,
        role: "assistant",
        text: notice.text,
        notice,
        answerNotice,
        answerLoading: answerEngineAvailable && notice.kind === "no_match",
      });
      return next;
    });
    if (notice.kind === "no_match")
      lookupAnswer(noticeId, notice.source ?? userText ?? "", intake.platform);
  };

  /** Start a brand-new problem (typed, or an example chip). */
  const startProblem = (raw: string) => {
    if (intake.loading) return;
    setActionError(null);
    const text = raw.trim();
    if (!text) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      pushNotice({
        kind: "off_topic",
        text: "That's a lot of detail. Please describe the problem in under 1,000 characters.",
      });
      return;
    }
    const notice = preflightNotice(text);
    if (notice) {
      intake.setProblem("");
      // Never echo a secret into the transcript (and never send it).
      pushNotice(notice, notice.kind === "sensitive" ? undefined : text);
      return;
    }
    setTranscript((current) => [
      ...current,
      { id: `u-${current.length}`, role: "user", text },
    ]);
    outcomesDirty.current = true;
    setOutcomes({});
    setOutcomeScope(text);
    focusComposerAfterLoad.current = true;
    intake.handleStart(text);
  };

  const submitCurrentInput = () => {
    if (intake.loading) return;
    setActionError(null);
    if (output?.decision !== "clarify" || lastTurnIsNotice) {
      startProblem(intake.problem);
      return;
    }
    const text = intake.diagnosticAnswer;
    if (!text.trim()) return;
    const cumulativeTextLength =
      intake.problem.length +
      intake.previousAnswers.reduce(
        (total, answer) => total + answer.answer.length,
        0
      ) +
      text.length;
    if (
      text.length > MAX_ANSWER_LENGTH ||
      cumulativeTextLength > MAX_CUMULATIVE_TEXT_LENGTH
    ) {
      pushNotice(
        {
          kind: "off_topic",
          text: "That answer is too long. Please keep it under 500 characters.",
        },
        undefined,
        true
      );
      return;
    }
    const quality = classifyInput(text, { mode: "answer" });
    if (quality.kind === "sensitive" || quality.kind === "gibberish") {
      intake.setDiagnosticAnswer("");
      const notice: AssistantNoticeData = {
        kind: quality.kind,
        sensitiveType: quality.sensitiveType,
        text:
          quality.kind === "gibberish"
            ? "Hmm, I couldn’t understand that answer. Could you answer the question in a few words?"
            : noticeText("sensitive", quality.sensitiveType),
      };
      pushNotice(
        notice,
        quality.kind === "gibberish" ? text.trim() : undefined,
        true
      );
      return;
    }
    setTranscript((current) => [
      ...current,
      { id: `u-${current.length}`, role: "user", text: text.trim() },
    ]);
    const questionId = output.diagnosticQuestionIds?.[0];
    if (questionId) {
      focusComposerAfterLoad.current = true;
      intake.handleSubmitAnswer(questionId, text);
    }
  };

  const rephrase = (text: string) => {
    intake.setProblem(text);
    document.getElementById("assistant-input")?.focus();
  };

  const lastTurn = transcript[transcript.length - 1];
  const lastTurnIsNotice = Boolean(lastTurn?.notice && !lastTurn.answerNotice);
  // A local notice after an answer means the requester moved on: hide the
  // previous result so the conversation reads top to bottom.
  const output = lastTurnIsNotice ? null : intake.currentOutput;
  const questionKey =
    output?.decision === "clarify"
      ? `q-${output.diagnosticQuestionIds?.[0] ?? "more"}-${intake.previousAnswers.length}`
      : null;

  // Add each new clarifying question to the transcript exactly once.
  useEffect(() => {
    if (
      intake.loading ||
      intake.error ||
      !questionKey ||
      output?.decision !== "clarify"
    )
      return;
    const text = clarificationText(output);
    queueMicrotask(() =>
      setTranscript((current) =>
        current.some((turn) => turn.id === questionKey)
          ? current
          : [...current, { id: questionKey, role: "assistant", text }]
      )
    );
  }, [questionKey, output, intake.loading, intake.error]);
  const matchedIssue = output?.matchedIssueSlug
    ? getIssueBySlug(output.matchedIssueSlug)
    : null;
  const allPolicySteps = matchedIssue ? getIssueStepPolicies(matchedIssue) : [];
  const policySteps = stepPolicyEnabled
    ? allPolicySteps.filter((step) => isOfferable(step.risk, "requester"))
    : allPolicySteps;
  const triedSteps = policySteps.filter((step) =>
    ["failed", "could_not_perform"].includes(
      outcomes[`${matchedIssue?.id}:${step.stepIndex}`]
    )
  );
  const offeredSteps = policySteps
    .filter(
      (step) =>
        !["failed", "could_not_perform"].includes(
          outcomes[`${matchedIssue?.id}:${step.stepIndex}`]
        )
    )
    .slice(0, 5);
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
              `- ${step.text}: ${OUTCOME_LABELS[outcomes[`${matchedIssue.id}:${step.stepIndex}`]]}`
          )
          .join("\n")}`
      : undefined;
  const loginHref = loginLink(intake.problem, intake.platform);
  const composerHint = liveHint(
    intake.loading
      ? ""
      : output?.decision === "clarify"
        ? intake.diagnosticAnswer
        : intake.problem,
    output?.decision === "clarify" ? "answer" : "problem"
  );
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
    ? `/issues/${matchedIssue.id}/guide?platform=${platformSlug(output?.detectedPlatform ?? intake.platform ?? "Other")}`
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
    outcomesDirty.current = true;
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
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <div className="hf-rise relative mb-5 overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#5b3cc4,#8b6cf6_60%,#c084fc)] p-6 text-white shadow-[var(--shadow-md)] sm:p-7">
        <span
          aria-hidden
          className="absolute -top-16 right-10 h-48 w-48 rounded-full bg-white/10"
        />
        <span
          aria-hidden
          className="absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-pink-400/20"
        />
        <div className="relative flex items-center gap-4">
          <Avatar id="bot" size={64} className="ring-4 ring-white/25" />
          <div className="min-w-0">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Support Assistant
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="hf-ping absolute inset-0 rounded-full bg-[#5ee0a8]" />
                  <span className="relative h-2 w-2 rounded-full bg-[#5ee0a8]" />
                </span>
                Online
              </span>
              <span>Grounded in approved HelpDesk First guides.</span>
            </p>
          </div>
        </div>
      </div>

      <ProgressStepper
        current={
          output?.decision === "match"
            ? 3
            : output?.decision === "escalate"
              ? 2
              : intake.error && !intake.loading && !output
                ? 0
                : lastTurnIsNotice && !intake.loading
                  ? 0
                  : userTurns.length > 0 || intake.loading
                    ? 1
                    : 0
        }
      />

      <div role="log" aria-live="polite" className="space-y-5">
        {transcript
          .filter(
            (turn) =>
              !(
                intake.loading &&
                turn.role === "assistant" &&
                turn.id.startsWith("q-")
              )
          )
          .map((turn, index) =>
            turn.notice ? (
              <div key={turn.id} className="space-y-3">
                <AssistantNotice
                  notice={turn.notice}
                  onExample={startProblem}
                  onRephrase={rephrase}
                  disabled={intake.loading}
                  guideHref={(id) =>
                    `/issues/${id}/guide?platform=${platformSlug(intake.platform ?? "Other")}`
                  }
                  handoff={
                    turn.notice.kind === "no_match" &&
                    turn.answerCard?.outcome !== "needs_it" ? (
                      <HandoffAction
                        problem={turn.notice.source ?? ""}
                        platform={intake.platform}
                        signedIn={signedIn}
                        workflowEnabled={workflowEnabled}
                        pending={actionPending || intake.loading}
                        onSend={sendToSupport}
                      />
                    ) : undefined
                  }
                />
                {turn.answerLoading && (
                  <Message
                    side="assistant"
                    text="There's no guide for this yet, so I'm checking trusted sources…"
                    animate={false}
                  />
                )}
                {turn.answerRateLimited && (
                  <p className="pl-11 text-sm text-muted-foreground">
                    You&apos;ve reached the answer limit for now. Sign in or try
                    again later.
                  </p>
                )}
                {turn.answerCard && (
                  <AnswerCard
                    card={turn.answerCard}
                    handoff={
                      turn.answerCard.outcome === "needs_it" ? (
                        <HandoffAction
                          problem={turn.notice.source ?? ""}
                          platform={intake.platform}
                          signedIn={signedIn}
                          workflowEnabled={workflowEnabled}
                          pending={actionPending || intake.loading}
                          onSend={sendToSupport}
                        />
                      ) : undefined
                    }
                  />
                )}
              </div>
            ) : (
              <Message
                key={turn.id}
                side={turn.role}
                text={turn.text}
                animate={
                  turn.role === "assistant" && index === transcript.length - 1
                }
              />
            )
          )}
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
                  onClick={() => void sendToSupport()}
                  disabled={actionPending || intake.loading}
                  className="mt-4 h-auto max-w-full whitespace-normal"
                >
                  Send to a support person
                </Button>
              ) : workflowEnabled ? (
                <Link
                  href={loginHref}
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "mt-4 h-auto max-w-full whitespace-normal"
                  )}
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
            {intake.loading && <TypingIndicator />}
            {output?.decision === "escalate" && (
              <Escalation
                output={output}
                signedIn={signedIn}
                workflowEnabled={workflowEnabled}
                onSend={sendToSupport}
                searchHref={intake.searchHref()}
                loginHref={loginHref}
                actionError={actionError}
                actionPending={actionPending || intake.loading}
                closest={closestGuides(output, intake.problem)}
                platform={intake.platform}
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
                actionPending={actionPending || intake.loading}
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
                  onClick={() => void intake.retry()}
                  disabled={intake.loading}
                >
                  Retry
                </Button>
              </div>
            )}
            {!output &&
              !intake.loading &&
              !initialProblem &&
              transcript.length === 0 && (
                <div className="space-y-1">
                  <Message
                    side="assistant"
                    text="Describe your IT problem below and I’ll help find an approved guide."
                  />
                  <div className="pl-11">
                    <ExampleChips onPick={startProblem} />
                  </div>
                </div>
              )}
          </>
        )}
      </div>

      {!ticketIntent && (
        <div className="mt-8 border-t border-border bg-background pt-4 [padding-bottom:env(safe-area-inset-bottom)]">
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
            {output?.decision === "clarify" && !intake.loading && (
              <span className="v2-badge">
                Question {Math.min(intake.previousAnswers.length + 1, 3)} of 3
              </span>
            )}
          </div>
          <Composer
            value={
              intake.loading
                ? ""
                : output?.decision === "clarify"
                  ? intake.diagnosticAnswer
                  : intake.problem
            }
            onChange={(value) =>
              output?.decision === "clarify"
                ? intake.setDiagnosticAnswer(value)
                : intake.setProblem(value)
            }
            onSend={submitCurrentInput}
            disabled={intake.loading}
            sendDisabled={
              !(output?.decision === "clarify"
                ? intake.diagnosticAnswer.trim()
                : intake.problem.trim())
            }
            hint={composerHint.text}
            hintTone={composerHint.tone}
            placeholder={
              output?.decision === "clarify"
                ? "Answer the question…"
                : "Describe your IT problem…"
            }
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{SAFE_USE_WARNING}</p>
            {workflowEnabled && signedIn ? (
              <Button
                variant="outline"
                className="shrink-0"
                onClick={() => void sendToSupport()}
                disabled={actionPending || intake.loading}
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

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Local assistant reply (greeting, alert, no approved guide…). */
  notice?: AssistantNoticeData;
  /** Notice about a clarifying answer; keeps the current question active. */
  answerNotice?: boolean;
  answerLoading?: boolean;
  answerRateLimited?: boolean;
  answerCard?: AnswerCardData;
};

function initialTranscript(initialProblem: string): ChatTurn[] {
  if (!initialProblem) return [];
  if (classifyInput(initialProblem).kind === "sensitive") return [];
  return [{ id: "u-0", role: "user", text: initialProblem }];
}

function answerCardFromResponse(value: unknown): AnswerCardData | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (
    payload.status !== "ok" ||
    !payload.card ||
    typeof payload.card !== "object"
  )
    return null;
  const card = payload.card as Record<string, unknown>;
  if (card.outcome !== "answer" && card.outcome !== "needs_it") return null;
  if (
    !Array.isArray(card.steps) ||
    !Array.isArray(card.explanations) ||
    !Array.isArray(card.sources)
  )
    return null;
  return card as unknown as AnswerCardData;
}

/**
 * Screens a new problem before the intake pipeline runs. Returns a local
 * notice when the text is not a real, supported IT problem description.
 */
function preflightNotice(text: string): AssistantNoticeData | null {
  const quality = classifyInput(text);
  if (quality.kind === "ok") {
    const match = matchGuides(text);
    if (match.status !== "none") return null;
    return {
      kind: "no_match",
      text: noticeText("no_match"),
      source: text,
      suggestions: match.suggestions.map(({ id, title }) => ({ id, title })),
    };
  }
  if (quality.kind === "empty") return null;
  return {
    kind: quality.kind,
    sensitiveType: quality.sensitiveType,
    text: noticeText(quality.kind, quality.sensitiveType),
  };
}

function liveHint(
  text: string,
  mode: "problem" | "answer"
): { text: string | null; tone: "muted" | "warning" | "danger" } {
  const hint = inputHint(text, { mode });
  if (!hint) return { text: null, tone: "muted" };
  const kind = classifyInput(text, { mode }).kind;
  return {
    text: hint,
    tone:
      kind === "sensitive"
        ? "danger"
        : kind === "gibberish" || kind === "off_topic"
          ? "warning"
          : "muted",
  };
}

/** Closest approved guides for an escalation (server list, else local). */
function closestGuides(
  output: AiIntakeOutput,
  problem: string
): { id: string; title: string }[] {
  const fromServer = (output.suggestedIssueSlugs ?? [])
    .map((slug) => getIssueBySlug(slug))
    .filter((issue): issue is NonNullable<typeof issue> => Boolean(issue));
  if (fromServer.length > 0)
    return fromServer.slice(0, 3).map(({ id, title }) => ({ id, title }));
  if (!problem.trim() || classifyInput(problem).kind !== "ok") return [];
  return matchGuides(problem)
    .candidates.filter((item) => item.confidence >= 0.2)
    .map(({ issue }) => ({ id: issue.id, title: issue.title }));
}

function shareableProblem(text: string) {
  return classifyInput(text).kind === "sensitive" ? "" : text;
}

/** "Talk to a person" using the existing human-handoff paths. */
function HandoffAction({
  problem,
  platform,
  signedIn,
  workflowEnabled,
  pending,
  onSend,
}: {
  problem: string;
  platform: Platform | null;
  signedIn: boolean;
  workflowEnabled: boolean;
  pending: boolean;
  onSend: (message?: string) => Promise<void>;
}) {
  if (workflowEnabled && signedIn) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => void onSend(problem)}
        disabled={pending}
      >
        <Headset className="mr-1.5 h-4 w-4" aria-hidden />
        Talk to a person
      </Button>
    );
  }
  const params = new URLSearchParams({ intent: "human" });
  const shareable = shareableProblem(problem);
  if (shareable) params.set("q", shareable);
  if (platform) params.set("platform", platformSlug(platform));
  return (
    <Link
      href={`/assistant?${params.toString()}`}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      <Headset className="mr-1.5 h-4 w-4" aria-hidden />
      Talk to a person
    </Link>
  );
}

function Message({
  side,
  text,
  animate = true,
}: {
  side: "user" | "assistant";
  text: string;
  /** Type the text out; older messages render instantly. */
  animate?: boolean;
}) {
  if (side === "user") {
    return (
      <div className="hf-rise flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-primary-foreground shadow-sm">
          <span className="sr-only">You: </span>
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="hf-rise flex items-end gap-2.5">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
      >
        <Bot className="h-5 w-5" />
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-sm">
        <p className="mb-1 text-xs font-bold text-muted-foreground">
          Assistant
        </p>
        <p>
          <span className="sr-only">Assistant: </span>
          {animate ? (
            <TypewriterText text={text} />
          ) : (
            <span className="whitespace-pre-wrap">{text}</span>
          )}
        </p>
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
                  <span>Likely match</span>
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
                    {
                      OUTCOME_LABELS[
                        outcomes[`${output.matchedIssueSlug}:${step.stepIndex}`]
                      ]
                    }
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
                  {
                    OUTCOME_LABELS[
                      outcomes[`${output.matchedIssueSlug}:${step.stepIndex}`]
                    ]
                  }
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
  closest = [],
  platform = null,
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
  closest?: { id: string; title: string }[];
  platform?: Platform | null;
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
      {closest.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Closest guides
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Not an exact match — but these approved guides are the closest.
          </p>
          <ul className="mt-2 space-y-2">
            {closest.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={`/issues/${issue.id}/guide?platform=${platformSlug(output.detectedPlatform ?? platform ?? "Other")}`}
                  className="hf-asst-suggest block rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold"
                >
                  {issue.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {workflowEnabled && signedIn ? (
          <Button
            className="h-auto max-w-full whitespace-normal"
            onClick={() => void onSend()}
            disabled={actionPending}
          >
            {prominent
              ? "Create a support ticket with this history"
              : "Send to a support person"}
          </Button>
        ) : workflowEnabled ? (
          <Link
            href={loginHref}
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-auto max-w-full whitespace-normal"
            )}
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

function loginLink(problem: string, platform: Platform | null) {
  const next = new URLSearchParams({ intent: "human" });
  const shareable = shareableProblem(problem);
  if (shareable) next.set("q", shareable);
  if (platform) next.set("platform", platformSlug(platform));
  return `/login?next=${encodeURIComponent(`/assistant?${next.toString()}`)}`;
}
