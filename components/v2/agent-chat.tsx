"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  History,
  Laptop,
  LifeBuoy,
  Paperclip,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentEvent } from "@/lib/agent/types";
import { uploadSecureAttachment } from "@/lib/attachments/client";
import {
  AssistantNotice,
  type AssistantNoticeData,
} from "@/components/assistant/input-notice";
import { classifyInput, inputHint } from "@/lib/assistant/input-quality";
import { noticeText } from "@/lib/assistant/replies";
import { OutcomeFeedback } from "@/components/v2/outcome-feedback";
import { subscribeToOutage } from "@/app/actions/outage-subscriptions";

type TimelineItem = AgentEvent & { id: number };
type ScreenshotState = {
  id: string;
  name: string;
  status: "scanning" | "ready" | "rejected";
  error?: string;
};

type OutageSubscriptionState = "pending" | "subscribed" | "unavailable";

function safeIncidentText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+|\bwww\.\S+/gi, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function iconFor(event: AgentEvent) {
  if (event.type === "tool_started" || event.type === "tool_result_summary")
    return event.tool.includes("device") ? Laptop : Search;
  if (event.type === "escalated") return LifeBuoy;
  if (event.type === "halted") return ShieldAlert;
  if (event.type === "session") return UserRound;
  return Bot;
}

export function AgentChat({
  initialProblem = "",
  initialPlatform,
  visionEnabled = false,
  feedbackEnabled = false,
  serviceHealthEnabled = false,
}: {
  initialProblem?: string;
  initialPlatform?: string | null;
  visionEnabled?: boolean;
  feedbackEnabled?: boolean;
  serviceHealthEnabled?: boolean;
}) {
  const [message, setMessage] = useState(initialProblem);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [ended, setEnded] = useState(false);
  const [answeredCards, setAnsweredCards] = useState<Record<number, boolean>>(
    {}
  );
  const itemsRef = useRef<TimelineItem[]>([]);
  const answeredCardsRef = useRef<Record<number, boolean>>({});
  const [now, setNow] = useState(() => Date.now());
  const [screenshot, setScreenshot] = useState<ScreenshotState | null>(null);
  const [outageSubscriptionStates, setOutageSubscriptionStates] = useState<
    Record<string, OutageSubscriptionState>
  >({});
  // Local reply for input that should not be sent (greeting, mashing, secret…).
  const [notice, setNotice] = useState<AssistantNoticeData | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null
  );
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function clearTranscript() {
    itemsRef.current = [];
    answeredCardsRef.current = {};
    setItems([]);
    setAnsweredCards({});
    setOutageSubscriptionStates({});
  }

  async function subscribeToIncident(incident: {
    source: "microsoft365" | "google_workspace" | "statuspage";
    incidentId: string;
  }) {
    const key = `${incident.source}:${incident.incidentId}`;
    if (!sessionId) {
      setOutageSubscriptionStates((current) => ({
        ...current,
        [key]: "unavailable",
      }));
      return;
    }
    setOutageSubscriptionStates((current) => ({
      ...current,
      [key]: "pending",
    }));
    try {
      const result = await subscribeToOutage({
        sessionId,
        source: incident.source,
        incidentId: incident.incidentId,
      });
      setOutageSubscriptionStates((current) => ({
        ...current,
        [key]: result.ok ? "subscribed" : "unavailable",
      }));
    } catch {
      setOutageSubscriptionStates((current) => ({
        ...current,
        [key]: "unavailable",
      }));
    }
  }

  function appendEvent(event: AgentEvent) {
    const current = itemsRef.current;
    const answered = { ...answeredCardsRef.current };
    if (
      event.type !== "session_consent_offer" &&
      event.type !== "session_consent" &&
      event.type !== "session"
    ) {
      current.forEach((item) => {
        if (
          item.type === "consent_required" ||
          item.type === "confirm_required"
        ) {
          answered[item.id] = true;
        }
      });
    }
    const next = [...current, { ...event, id: current.length }];
    itemsRef.current = next;
    answeredCardsRef.current = answered;
    setAnsweredCards(answered);
    setItems(next);
  }

  function answerCard(id: number) {
    const answered = { ...answeredCardsRef.current, [id]: true };
    answeredCardsRef.current = answered;
    setAnsweredCards(answered);
  }

  async function send(
    humanRequested = false,
    action?: {
      consent?: { approvalRequestId: string; decision: "approve" | "decline" };
      confirm?: "yes" | "no";
      sessionConsent?: "grant" | "revoke";
      userStep?: {
        stepId: string;
        outcome: "done" | "didnt_work" | "cant_do";
      };
    },
    messageOverride?: string
  ) {
    const typed = messageOverride ?? message;
    const attachmentIds =
      screenshot?.status === "ready" ? [screenshot.id] : undefined;
    if (
      pending ||
      (terminal && !humanRequested) ||
      (!typed.trim() && !humanRequested && !action && !attachmentIds?.length)
    )
      return;
    if (!action && !humanRequested && typed.trim()) {
      // Mid-conversation replies ("yes", "Mac") are fine; only a fresh
      // problem gets the full greeting / off-topic screening.
      const quality = classifyInput(typed, {
        mode: sessionId ? "answer" : "problem",
      });
      if (quality.kind !== "ok" && quality.kind !== "empty") {
        if (quality.kind === "sensitive") setMessage("");
        setNotice({
          kind: quality.kind,
          sensitiveType: quality.sensitiveType,
          text: noticeText(quality.kind, quality.sensitiveType),
        });
        return;
      }
    }
    setNotice(null);
    setPending(true);
    if (!action && !humanRequested) clearTranscript();
    if (attachmentIds) setScreenshot(null);
    const body: Record<string, unknown> = {
      sessionId,
      message: action?.userStep
        ? ""
        : typed.trim() ||
          (attachmentIds?.length
            ? "I shared a screenshot of the problem."
            : "I would like to speak with a human."),
      humanRequested,
      ...(attachmentIds ? { attachmentIds } : {}),
      ...action,
    };
    if (typeof initialPlatform === "string") body.platform = initialPlatform;
    const response = await fetch("/api/ai/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) {
      setPending(false);
      if (!humanRequested) clearTranscript();
      appendEvent({
        type: "error",
        message: "The assistant is unavailable.",
      });
      return;
    }
    const reader = response.body.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame
            .split("\n")
            .find((value) => value.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as AgentEvent;
          appendEvent(event);
          if (event.type === "session") setSessionId(event.sessionId);
          if (event.type === "resolved") {
            setTerminal(true);
            setEnded(true);
          }
          if (event.type === "escalated" || event.type === "halted") {
            setTerminal(true);
            setEnded(true);
          }
          if (event.type === "error") {
            if (event.recoverable) {
              setScreenshot(null);
            } else {
              setTerminal(true);
            }
          }
        }
      }
    } catch {
      if (!terminal)
        appendEvent({
          type: "error",
          message: "The connection ended unexpectedly.",
        });
    } finally {
      readerRef.current = null;
      setPending(false);
    }
  }

  const hint = composerHint(message, sessionId ? "answer" : "problem");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div className="rounded-3xl border border-border/60 bg-background/80 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Bot className="hf-bob size-5" aria-hidden />
          <div>
            <p className="font-semibold">AI support assistant</p>
            <p className="text-sm text-muted-foreground">
              You&apos;re talking to an AI assistant
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-3" role="log" aria-live="polite">
          {items.some(
            (event) =>
              event.type === "session_consent" && event.state === "granted"
          ) &&
            !items.some(
              (event) =>
                event.type === "session_consent" && event.state === "revoked"
            ) && (
              <div className="flex items-center justify-between rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
                <span>Automatic safe fixes: on</span>
                <button
                  type="button"
                  className="font-medium underline"
                  onClick={() => void send(false, { sessionConsent: "revoke" })}
                  disabled={pending}
                >
                  Revoke
                </button>
              </div>
            )}
          {items.map((event) => {
            const Icon = iconFor(event);
            if (event.type === "service_incident") {
              if (!serviceHealthEnabled) return null;
              return (
                <div key={event.id} className="space-y-3">
                  {event.incidents.map((incident) => {
                    const service = safeIncidentText(incident.service);
                    const title = safeIncidentText(incident.title);
                    const key = `${incident.source}:${incident.incidentId}`;
                    const state = outageSubscriptionStates[key];
                    const impactLabel = {
                      outage: "Outage",
                      degraded: "Degraded",
                      informational: "Informational",
                    }[incident.impact];
                    return (
                      <section
                        key={key}
                        aria-label="Known outage"
                        className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold">Known outage</p>
                          <span className="rounded-full border border-amber-500/40 px-2.5 py-1 text-xs font-medium">
                            {impactLabel}
                          </span>
                        </div>
                        <p className="mt-2 font-medium">{service}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {title}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <a
                            href={incident.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm underline underline-offset-4"
                          >
                            View status page
                          </a>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              state === "pending" ||
                              state === "subscribed" ||
                              state === "unavailable"
                            }
                            onClick={() => void subscribeToIncident(incident)}
                          >
                            {state === "pending"
                              ? "Sending…"
                              : state === "subscribed"
                                ? "Subscribed"
                                : state === "unavailable"
                                  ? "Unavailable"
                                  : "Notify me when fixed"}
                          </Button>
                        </div>
                      </section>
                    );
                  })}
                </div>
              );
            }
            if (event.type === "final_answer")
              return (
                <div
                  key={event.id}
                  className="hf-rise rounded-2xl bg-muted p-4"
                >
                  <p>{event.text}</p>
                  {event.evidence.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide">
                        Evidence
                      </p>
                      <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                        {event.evidence.map((evidence) => (
                          <li key={evidence}>{evidence}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            if (event.type === "consent_required") {
              const expiresAt = new Date(event.card.expiresAt).getTime();
              const remaining = Math.max(0, expiresAt - now);
              const expired = remaining === 0;
              const disabled = answeredCards[event.id] || expired;
              return (
                <div
                  key={event.id}
                  className="hf-rise rounded-2xl border border-primary/30 bg-primary/5 p-4"
                >
                  <p className="font-medium">Approval needed</p>
                  <p className="mt-2 text-sm">{event.card.whatHappens}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Affected {event.card.target.kind}: {event.card.target.label}
                    . Reversible: {event.card.reversible ? "yes" : "no"}.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {expired
                      ? "This approval has expired."
                      : `Expires in ${Math.ceil(remaining / 1000)} seconds.`}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        answerCard(event.id);
                        void send(false, {
                          consent: {
                            approvalRequestId: event.card.approvalRequestId,
                            decision: "approve",
                          },
                        });
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => {
                        answerCard(event.id);
                        void send(false, {
                          consent: {
                            approvalRequestId: event.card.approvalRequestId,
                            decision: "decline",
                          },
                        });
                      }}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              );
            }
            if (event.type === "user_step") {
              const disabled = pending || answeredCards[event.id];
              return (
                <section
                  key={event.id}
                  aria-label="Your step"
                  className="rounded-2xl border border-primary/30 bg-primary/5 p-4"
                >
                  <p className="font-medium">Your step</p>
                  <p className="mt-2 font-medium">{event.card.instruction}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Why this helps: {event.card.why}
                  </p>
                  <p className="mt-2 text-sm">
                    Source:{" "}
                    <Link
                      href={event.card.source.url}
                      className="underline underline-offset-4"
                    >
                      {event.card.source.title}
                    </Link>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        answerCard(event.id);
                        void send(false, {
                          userStep: {
                            stepId: event.card.stepId,
                            outcome: "done",
                          },
                        });
                      }}
                    >
                      Done
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => {
                        answerCard(event.id);
                        void send(false, {
                          userStep: {
                            stepId: event.card.stepId,
                            outcome: "didnt_work",
                          },
                        });
                      }}
                    >
                      Didn&apos;t work
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => {
                        answerCard(event.id);
                        void send(false, {
                          userStep: {
                            stepId: event.card.stepId,
                            outcome: "cant_do",
                          },
                        });
                      }}
                    >
                      I can&apos;t do this
                    </Button>
                  </div>
                </section>
              );
            }
            if (event.type === "session_consent_offer") {
              const disabled = answeredCards[event.id];
              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4"
                >
                  <p className="font-medium">{event.card.title}</p>
                  <ul className="mt-2 space-y-2 text-sm">
                    {event.card.capabilities.map((capability) => (
                      <li key={capability.id}>
                        <strong>{capability.title}</strong>
                        <span className="block text-muted-foreground">
                          {capability.whatHappens} · Reversible: yes
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Expires in {Math.ceil(event.card.expiresInMs / 60_000)}{" "}
                    minutes.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        answerCard(event.id);
                        void send(false, { sessionConsent: "grant" });
                      }}
                    >
                      Allow for this session
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => {
                        answerCard(event.id);
                        void send(false, { sessionConsent: "revoke" });
                      }}
                    >
                      Not now
                    </Button>
                  </div>
                </div>
              );
            }
            if (event.type === "action_executing")
              return (
                <div key={event.id} className="flex items-center gap-2 text-sm">
                  <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {event.text}
                </div>
              );
            if (event.type === "screenshot_received")
              return (
                <div
                  key={event.id}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <Paperclip className="mt-0.5 size-4 shrink-0" />
                  <span>Screenshot received — {event.summary}</span>
                </div>
              );
            if (event.type === "verification_result")
              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-border/60 p-4 text-sm"
                >
                  <p className="font-medium">
                    Verification:{" "}
                    {event.status === "passed" ? "passed" : event.status}
                  </p>
                  <p className="mt-1 text-muted-foreground">{event.text}</p>
                </div>
              );
            if (event.type === "confirm_required")
              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-primary/30 bg-primary/5 p-4"
                >
                  <p className="font-medium">{event.text}</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={answeredCards[event.id]}
                      onClick={() => {
                        answerCard(event.id);
                        void send(false, { confirm: "yes" });
                      }}
                    >
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={answeredCards[event.id]}
                      onClick={() => {
                        answerCard(event.id);
                        void send(false, { confirm: "no" });
                      }}
                    >
                      No, still broken
                    </Button>
                  </div>
                </div>
              );
            if (event.type === "resolved")
              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4"
                >
                  <p className="font-medium">{event.text}</p>
                  {feedbackEnabled && sessionId && (
                    <OutcomeFeedback sessionId={sessionId} />
                  )}
                </div>
              );
            if (event.type === "escalated" || event.type === "halted")
              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Icon className="size-4" />
                    {event.type === "halted"
                      ? "This session was stopped for safety; a ticket has been created."
                      : "A support ticket has been created."}
                  </div>
                  {"ticketId" in event && event.ticketId && (
                    <Link
                      className="mt-2 inline-block underline"
                      href={`/tickets/${event.ticketId}`}
                    >
                      Open ticket
                    </Link>
                  )}
                </div>
              );
            const text =
              event.type === "thinking_summary"
                ? event.text
                : event.type === "tool_started"
                  ? `Checking ${event.tool.replaceAll("_", " ")}…`
                  : event.type === "tool_result_summary"
                    ? event.summary
                    : event.type === "error"
                      ? event.message
                      : "";
            return text ? (
              <div
                key={event.id}
                className={cn(
                  "flex items-start gap-2 text-sm",
                  event.type === "thinking_summary" && "text-muted-foreground"
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0" />
                <span>{text}</span>
              </div>
            ) : null;
          })}
        </div>
        {notice && (
          <div className="mt-4">
            <AssistantNotice
              notice={notice}
              disabled={pending || terminal}
              onExample={(example) => {
                setMessage(example);
                void send(false, undefined, example);
              }}
            />
          </div>
        )}
        <label htmlFor="agent-chat-composer" className="sr-only">
          Describe your IT problem
        </label>
        <textarea
          id="agent-chat-composer"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={pending || terminal}
          aria-label="Describe your IT problem"
          aria-describedby="agent-chat-hint"
          placeholder="Describe the IT problem you need help with."
          className="mt-6 min-h-28 w-full rounded-3xl border border-input bg-card p-4 text-base outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
        <p
          id="agent-chat-hint"
          aria-live="polite"
          className={cn(
            "hf-asst-hint min-h-5 pt-1.5 text-xs",
            hint.tone === "warning" && "hf-asst-hint-warn",
            hint.tone === "danger" && "hf-asst-hint-danger",
            hint.tone === "muted" && "text-muted-foreground"
          )}
        >
          {hint.text && (
            <span key={hint.text} className="hf-asst-hint-in">
              {hint.text}
            </span>
          )}
        </p>
        {visionEnabled && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="glass-pill inline-flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
              <Paperclip className="size-4" />
              Screenshot
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setScreenshot({
                    id: `pending-${crypto.randomUUID()}`,
                    name: file.name,
                    status: "scanning",
                  });
                  void uploadSecureAttachment(file).then((result) => {
                    if ("error" in result) {
                      setScreenshot({
                        id: `rejected-${crypto.randomUUID()}`,
                        name: file.name,
                        status: "rejected",
                        error: result.error,
                      });
                      return;
                    }
                    setScreenshot({
                      id: result.attachmentId,
                      name: file.name,
                      status: result.status,
                    });
                  });
                }}
              />
            </label>
            {screenshot && (
              <span
                className={cn(
                  "rounded-full border px-3 py-2 text-xs",
                  screenshot.status === "rejected" && "text-destructive"
                )}
              >
                Screenshot: {screenshot.name} ·{" "}
                {screenshot.status === "scanning"
                  ? "scanning…"
                  : screenshot.status}
                {screenshot.error ? ` (${screenshot.error})` : ""}
              </span>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => void send(true)}
            disabled={pending || ended}
          >
            <LifeBuoy className="mr-2 size-4" /> Talk to a human
          </Button>
          <Button
            className="hf-lift"
            onClick={() => void send()}
            disabled={
              pending ||
              terminal ||
              (!message.trim() && screenshot?.status !== "ready")
            }
          >
            {pending ? "Checking…" : "Ask the assistant"}
          </Button>
        </div>
        <div className="sr-only">
          <History />
        </div>
      </div>
    </div>
  );
}

function composerHint(
  text: string,
  mode: "problem" | "answer"
): { text: string | null; tone: "muted" | "warning" | "danger" } {
  const value = inputHint(text, { mode });
  if (!value) return { text: null, tone: "muted" };
  const kind = classifyInput(text, { mode }).kind;
  return {
    text: value,
    tone:
      kind === "sensitive"
        ? "danger"
        : kind === "gibberish" || kind === "off_topic"
          ? "warning"
          : "muted",
  };
}
