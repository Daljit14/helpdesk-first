"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  History,
  Laptop,
  LifeBuoy,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentEvent } from "@/lib/agent/types";

type TimelineItem = AgentEvent & { id: number };

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
}: {
  initialProblem?: string;
  initialPlatform?: string | null;
}) {
  const [message, setMessage] = useState(initialProblem);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [consentDecided, setConsentDecided] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null
  );

  async function send(
    humanRequested = false,
    action?: {
      consent?: { approvalRequestId: string; decision: "approve" | "decline" };
      confirm?: "yes" | "no";
    }
  ) {
    if (
      pending ||
      (terminal && !humanRequested) ||
      (!message.trim() && !humanRequested && !action)
    )
      return;
    setPending(true);
    if (!action) setItems([]);
    const response = await fetch("/api/ai/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        message: message.trim() || "I would like to speak with a human.",
        platform: initialPlatform,
        humanRequested,
        ...action,
      }),
    });
    if (!response.ok || !response.body) {
      setPending(false);
      setItems([
        {
          id: 0,
          type: "error",
          message: "The assistant is unavailable.",
        },
      ]);
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
          setItems((current) => [...current, { ...event, id: current.length }]);
          if (event.type === "session") setSessionId(event.sessionId);
          if (event.type === "consent_required") setConsentDecided(false);
          if (event.type === "consent_declined") {
            setConsentDecided(true);
          }
          if (event.type === "resolved") {
            setTerminal(true);
          }
          if (event.type === "escalated" || event.type === "halted") {
            setTerminal(true);
          }
          if (event.type === "final_answer" || event.type === "error")
            setTerminal(true);
        }
      }
    } catch {
      if (!terminal)
        setItems((current) => [
          ...current,
          {
            id: Date.now(),
            type: "error",
            message: "The connection ended unexpectedly.",
          },
        ]);
    } finally {
      readerRef.current = null;
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div className="rounded-3xl border border-border/60 bg-background/80 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Bot className="size-5" aria-hidden />
          <div>
            <p className="font-semibold">AI support assistant</p>
            <p className="text-sm text-muted-foreground">
              You&apos;re talking to an AI assistant
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-3" aria-live="polite">
          {items.map((event) => {
            const Icon = iconFor(event);
            if (event.type === "final_answer")
              return (
                <div key={event.id} className="rounded-2xl bg-muted p-4">
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
            if (event.type === "consent_required")
              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-primary/30 bg-primary/5 p-4"
                >
                  <p className="font-medium">Approval needed</p>
                  <p className="mt-2 text-sm">{event.card.whatHappens}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Affected {event.card.target.kind}: {event.card.target.label}
                    . Reversible: {event.card.reversible ? "yes" : "no"}.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={consentDecided || false}
                      onClick={() => {
                        setConsentDecided(true);
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
                      disabled={consentDecided}
                      onClick={() => {
                        setConsentDecided(true);
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
            if (event.type === "action_executing")
              return (
                <div key={event.id} className="flex items-center gap-2 text-sm">
                  <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {event.text}
                </div>
              );
            if (event.type === "verification_result")
              return (
                <div
                  key={event.id}
                  className="rounded-2xl border border-border/60 p-4 text-sm"
                >
                  <p className="font-medium">
                    Verification{" "}
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
                      onClick={() => void send(false, { confirm: "yes" })}
                    >
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void send(false, { confirm: "no" })}
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
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={pending || terminal}
          aria-label="Describe your IT problem"
          placeholder="Describe the IT problem you need help with."
          className="mt-6 min-h-28 w-full rounded-2xl border border-input bg-background p-3 text-sm"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => void send(true)}
            disabled={pending}
          >
            <LifeBuoy className="mr-2 size-4" /> Talk to a human
          </Button>
          <Button
            onClick={() => void send()}
            disabled={pending || terminal || !message.trim()}
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
