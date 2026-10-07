"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type {
  AnswerCard as AnswerCardData,
  AnswerCardStep,
} from "@/lib/answers/present";

type FeedbackOutcome = "helpful" | "not_helpful" | "fixed";

type Props = {
  card: AnswerCardData;
  onHandoff?: () => void;
  handoff?: ReactNode;
};

function SourceLinks({
  sourceIds,
  sources,
}: {
  sourceIds: string[];
  sources: AnswerCardData["sources"];
}) {
  return (
    <span className="ml-2 inline-flex flex-wrap gap-x-2 gap-y-1 text-xs">
      {sourceIds.flatMap((id) => {
        const source = sources.find((item) => item.id === id);
        if (!source) return [];
        return [
          <a
            key={id}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline underline-offset-2"
          >
            {source.label}
          </a>,
        ];
      })}
    </span>
  );
}

function StepItem({
  step,
  index,
  sources,
}: {
  step: AnswerCardStep;
  index: number;
  sources: AnswerCardData["sources"];
}) {
  if (step.kind === "community_tip") {
    return (
      <li
        key={`${step.kind}-${index}`}
        className="rounded-xl border border-border bg-muted/30 p-3"
      >
        <p className="text-xs font-semibold text-muted-foreground">
          Community tip — not official
        </p>
        <p className="mt-1">{step.text}</p>
        <SourceLinks sourceIds={step.sourceIds} sources={sources} />
      </li>
    );
  }
  return (
    <li key={`${step.kind}-${index}`}>
      <span className="text-xs font-semibold text-muted-foreground">
        Official step
      </span>
      <p className="mt-1">{step.text}</p>
      <SourceLinks sourceIds={step.sourceIds} sources={sources} />
    </li>
  );
}

export function AnswerCard({ card, onHandoff, handoff }: Props) {
  const [feedbackState, setFeedbackState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  async function sendFeedback(outcome: FeedbackOutcome) {
    if (!card.runId || feedbackState === "sending" || feedbackState === "sent")
      return;
    setFeedbackState("sending");
    try {
      const response = await fetch("/api/answers/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: card.runId, outcome }),
      });
      if (!response.ok) throw new Error("Feedback request failed");
      setFeedbackState("sent");
    } catch {
      setFeedbackState("error");
    }
  }

  if (card.outcome === "none") return null;

  return (
    <section
      aria-label="Answer from trusted sources"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <h2 className="text-lg font-semibold">
        {card.outcome === "answer"
          ? "Here's what usually fixes this"
          : "I found a fix, but it needs IT"}
      </h2>

      {card.likelyCause && (
        <p className="mt-3 text-sm">
          Likely cause: {card.likelyCause.text}
          <SourceLinks
            sourceIds={card.likelyCause.sourceIds}
            sources={card.sources}
          />
        </p>
      )}

      {card.steps.length > 0 && (
        <ol className="mt-4 list-decimal space-y-3 pl-5">
          {card.steps.map((step, index) => (
            <StepItem
              key={`${step.kind}-${index}`}
              step={step}
              index={index}
              sources={card.sources}
            />
          ))}
        </ol>
      )}

      {card.explanations.length > 0 && (
        <div className="mt-4">
          <h3 className="font-semibold">Good to know</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {card.explanations.map((item, index) => (
              <li key={`explanation-${index}`}>
                <span className="mr-1 text-xs font-semibold text-muted-foreground">
                  Reference
                </span>
                {item.text}
                <SourceLinks
                  sourceIds={item.sourceIds}
                  sources={card.sources}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.sources.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">Sources</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {card.sources.map((source) => (
              <li key={source.id}>
                <span className="mr-1 text-xs font-semibold text-muted-foreground">
                  {source.label}
                </span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="font-medium underline underline-offset-2"
                >
                  {source.title}
                </a>
                <span className="ml-2 text-xs text-muted-foreground">
                  {source.domain}
                </span>
                {source.attribution && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {source.attribution}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.outcome === "needs_it" && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-sm">
            Some steps need admin rights or security changes, so IT should do
            them.
          </p>
          {handoff ??
            (onHandoff && (
              <Button variant="outline" className="mt-3" onClick={onHandoff}>
                Talk to a person
              </Button>
            ))}
        </div>
      )}

      {card.runId && (
        <div className="mt-4 border-t border-border pt-3">
          {feedbackState === "sent" ? (
            <p role="status" className="text-sm">
              Thanks for telling us.
            </p>
          ) : (
            <p className="text-sm font-medium">Did this help?</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={feedbackState === "sending" || feedbackState === "sent"}
              onClick={() => void sendFeedback("fixed")}
            >
              Yes, it&apos;s fixed
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={feedbackState === "sending" || feedbackState === "sent"}
              onClick={() => void sendFeedback("helpful")}
            >
              It helped
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={feedbackState === "sending" || feedbackState === "sent"}
              onClick={() => void sendFeedback("not_helpful")}
            >
              No
            </Button>
          </div>
          {feedbackState === "error" && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              Couldn&apos;t save that. Try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
