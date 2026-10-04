"use client";

import { type FormEvent, useId, useState, useTransition } from "react";
import Link from "next/link";
import {
  submitAgentOutcomeFeedback,
  type OutcomeFeedbackVerdict,
} from "@/app/actions/agent-feedback";
import { Button } from "@/components/ui/button";

const VERDICTS: Array<{
  value: OutcomeFeedbackVerdict;
  label: string;
}> = [
  { value: "still_broken", label: "It's still broken" },
  { value: "came_back", label: "It came back" },
  { value: "wrong_problem", label: "You misunderstood my problem" },
  { value: "other", label: "Something else" },
];

function errorMessage(error: string): string {
  if (error === "already_submitted")
    return "You've already sent feedback for this session.";
  if (error === "not_eligible") return "Feedback is closed for this session.";
  return "Couldn't send feedback. Try again.";
}

export function OutcomeFeedback({ sessionId }: { sessionId: string }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [verdict, setVerdict] = useState<OutcomeFeedbackVerdict | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setExpanded(false);
    setVerdict(null);
    setText("");
    setError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verdict) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitAgentOutcomeFeedback({
          sessionId,
          verdict,
          text,
        });
        if (result.ok) {
          setSubmitted(true);
        } else {
          setError(errorMessage(result.error));
        }
      } catch {
        setError("Couldn't send feedback. Try again.");
      }
    });
  }

  if (submitted) {
    return (
      <div aria-live="polite" className="mt-3 text-sm">
        <p role="status" className="font-semibold">
          Thanks — this has been flagged for the support team.
        </p>
        <Link
          className="mt-1 inline-block font-semibold underline underline-offset-2"
          href="/assistant?intent=human"
        >
          Talk to a person
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-expanded={expanded}
        aria-controls={`${id}-form`}
        onClick={() => setExpanded((current) => !current)}
      >
        That wasn&apos;t right
      </Button>
      {expanded && (
        <form id={`${id}-form`} onSubmit={handleSubmit}>
          <fieldset
            aria-describedby={error ? `${id}-error` : undefined}
            aria-required="true"
            className="space-y-2"
          >
            <legend className="mb-2 font-semibold">What happened?</legend>
            {VERDICTS.map((item) => {
              const inputId = `${id}-${item.value}`;
              return (
                <label
                  key={item.value}
                  htmlFor={inputId}
                  className="flex cursor-pointer items-start gap-2 text-sm"
                >
                  <input
                    id={inputId}
                    type="radio"
                    name={`${id}-verdict`}
                    value={item.value}
                    required
                    checked={verdict === item.value}
                    onChange={() => {
                      setVerdict(item.value);
                      setError(null);
                    }}
                    className="mt-0.5"
                  />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </fieldset>
          <label
            htmlFor={`${id}-text`}
            className="mt-3 block text-sm font-semibold"
          >
            Anything else? (optional)
          </label>
          <textarea
            id={`${id}-text`}
            maxLength={1000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="mt-1 min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Don&apos;t include passwords or codes.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending || !verdict}>
              {pending ? "Sending…" : "Submit"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={cancel}
            >
              Cancel
            </Button>
          </div>
          <p
            id={`${id}-error`}
            role="status"
            aria-live="polite"
            className="mt-2 text-sm font-semibold text-destructive"
          >
            {error}
          </p>
        </form>
      )}
    </div>
  );
}
