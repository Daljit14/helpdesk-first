"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  BookOpen,
  Lock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SensitiveType } from "@/lib/assistant/input-quality";
import {
  EXAMPLE_PROBLEMS,
  noticeTitle,
  noticeTone,
  type NoticeKind,
} from "@/lib/assistant/replies";

export type AssistantNoticeData = {
  kind: NoticeKind;
  text: string;
  sensitiveType?: SensitiveType;
  /** Closest guides when there is no confident match. */
  suggestions?: { id: string; title: string }[];
  /** What the requester typed (used by "Rephrase"). Never set for secrets. */
  source?: string;
};

/** Clickable example problems that fill the composer and send. */
export function ExampleChips({
  onPick,
  disabled = false,
  label = "Try a common problem",
}: {
  onPick: (text: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="mt-3">
      <p className="sr-only">{label}</p>
      <ul className="flex flex-wrap gap-2" aria-label={label}>
        {EXAMPLE_PROBLEMS.map((example, index) => (
          <li
            key={example}
            className="hf-asst-chip-in"
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <button
              type="button"
              className="hf-asst-chip"
              disabled={disabled}
              onClick={() => onPick(example)}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {example}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A local assistant reply for input that should not go through the guide
 * pipeline (greetings, mashing, secrets, off-topic, no approved guide).
 */
export function AssistantNotice({
  notice,
  onExample,
  onRephrase,
  guideHref,
  handoff,
  disabled = false,
}: {
  notice: AssistantNoticeData;
  onExample: (text: string) => void;
  onRephrase?: (text: string) => void;
  guideHref?: (issueId: string) => string;
  /** "Talk to a person" control, supplied by the workspace. */
  handoff?: ReactNode;
  disabled?: boolean;
}) {
  const tone = noticeTone(notice.kind);

  if (tone === "friendly") {
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
            {notice.text}
          </p>
          <ExampleChips onPick={onExample} disabled={disabled} />
        </div>
      </div>
    );
  }

  if (notice.kind === "no_match") {
    const suggestions = notice.suggestions ?? [];
    return (
      <section
        role="status"
        className="hf-asst-card hf-pop rounded-3xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-status-info/15 text-status-info"
          >
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-extrabold tracking-tight">
              {noticeTitle("no_match")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {suggestions.length > 0
                ? "I don’t want to guess. These approved guides are the closest to what you described — they might not be an exact fit."
                : "Nothing in our approved library matches this closely. Try rephrasing with the device and what you see, or ask a person."}
            </p>
          </div>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Closest guides
            </h3>
            <ul className="mt-2 space-y-2">
              {suggestions.map((issue) => (
                <li key={issue.id}>
                  <Link
                    href={
                      guideHref ? guideHref(issue.id) : `/issues/${issue.id}`
                    }
                    className="hf-asst-suggest group flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold"
                  >
                    <span>{issue.title}</span>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {onRephrase && notice.source !== undefined && (
            <button
              type="button"
              className="hf-asst-chip"
              onClick={() => onRephrase(notice.source ?? "")}
              disabled={disabled}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Rephrase
            </button>
          )}
          {handoff}
        </div>
      </section>
    );
  }

  const Icon = tone === "danger" ? Lock : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        "hf-asst-alert hf-pop flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-sm",
        tone === "danger" ? "hf-asst-alert-danger" : "hf-asst-alert-warn"
      )}
    >
      <span aria-hidden className="hf-asst-alert-icon mt-0.5 shrink-0">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{noticeTitle(notice.kind)}</p>
        <p className="mt-0.5 text-sm">{notice.text}</p>
        {notice.kind !== "sensitive" && (
          <ExampleChips onPick={onExample} disabled={disabled} />
        )}
      </div>
    </div>
  );
}
