"use client";

import { Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Types `text` out character by character, like the assistant is writing it.
 *
 * Accessibility: screen readers get the full text once (sr-only), while the
 * animated copy is aria-hidden, so the live region is not spammed with every
 * character. Reduced-motion users see the full text immediately.
 */
export function TypewriterText({
  text,
  speed = 18,
  className,
  onDone,
}: {
  text: string;
  /** Milliseconds per character. */
  speed?: number;
  className?: string;
  onDone?: () => void;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      queueMicrotask(() => {
        setCount(text.length);
        onDone?.();
      });
      return;
    }
    queueMicrotask(() => setCount(0));
    let i = 0;
    const id = window.setInterval(() => {
      // Type a little faster through long answers.
      i += text.length > 240 ? 3 : 1;
      if (i >= text.length) {
        setCount(text.length);
        window.clearInterval(id);
        onDone?.();
      } else {
        setCount(i);
      }
    }, speed);
    return () => window.clearInterval(id);
    // onDone is intentionally excluded so a new callback identity does not restart typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed]);

  const typing = count < text.length;

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, count)}
        {typing && (
          <span className="hf-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] rounded bg-primary" />
        )}
      </span>
    </span>
  );
}

/** "Assistant is typing" bubble with three bouncing dots. */
export function TypingIndicator({
  label = "Assistant is thinking…",
}: {
  label?: string;
}) {
  return (
    <div className="hf-rise flex items-end gap-2.5">
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
      >
        <Bot className="hf-float-sm h-5 w-5" />
      </span>
      <div
        role="status"
        className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3.5 shadow-sm"
      >
        <span className="sr-only">{label}</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="hf-typing-dot h-2 w-2 rounded-full bg-primary"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
