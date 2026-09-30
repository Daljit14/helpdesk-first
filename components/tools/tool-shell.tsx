"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Info,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  copyText,
  formatReports,
  type Tone,
  type ToolReport,
} from "./diagnostics";

/**
 * Shared chrome for every self-check tool: the same dark "aurora" card as
 * the network check, a header with icon + actions, an aria-live channel,
 * and a verdict panel with a "Copy results for your ticket" button.
 */
export function ToolCard({
  id,
  icon: Icon,
  title,
  description,
  actions,
  children,
  report,
  live,
  active = false,
  className,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
  report?: ToolReport | null;
  /** Short status text announced to screen readers. */
  live?: string;
  /** Adds a subtle "working" glow to the icon tile. */
  active?: boolean;
  className?: string;
}) {
  const headingId = `${id}-tool-heading`;
  return (
    <section
      aria-labelledby={headingId}
      data-tool={id}
      className={cn(
        "hf-tool-card relative overflow-hidden rounded-[24px] bg-[radial-gradient(120%_120%_at_0%_0%,#2d1f63_0%,#16112a_55%,#0d0a1c_100%)] p-5 text-white shadow-[var(--shadow-md)] sm:p-6",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_top_left,black_30%,transparent_75%)]"
      />
      <div
        aria-hidden
        className="hf-blob-a pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#7c5cff]/25 blur-3xl"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-60">
          <h3
            id={headingId}
            className="flex items-center gap-2.5 text-lg font-extrabold"
          >
            <span
              className={cn(
                "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10",
                active && "hf-tool-glow"
              )}
            >
              <Icon className="h-5 w-5 text-[#c9b8ff]" aria-hidden />
            </span>
            {title}
          </h3>
          <p className="mt-2 max-w-xl text-sm text-white/70">{description}</p>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {children && <div className="relative mt-5">{children}</div>}

      <p className="sr-only" aria-live="polite">
        {live ?? ""}
      </p>

      {report && <Verdict report={report} />}
    </section>
  );
}

const TONE_BOX: Record<Tone, string> = {
  good: "border-[#5ee0a8]/30 bg-[#5ee0a8]/10 text-[#d1fae5]",
  warn: "border-[#ffd27c]/30 bg-[#ffd27c]/10 text-[#fef3c7]",
  bad: "border-[#ff9bb3]/30 bg-[#ff9bb3]/10 text-[#ffe4ea]",
  info: "border-[#9ee7ff]/30 bg-[#22d3ee]/10 text-[#cffafe]",
};

export const TONE_TEXT: Record<Tone, string> = {
  good: "text-[#5ee0a8]",
  warn: "text-[#ffd27c]",
  bad: "text-[#ff9bb3]",
  info: "text-[#9ee7ff]",
};

export function ToneIcon({
  tone,
  className,
}: {
  tone: Tone;
  className?: string;
}) {
  const Icon =
    tone === "good" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return <Icon className={cn(TONE_TEXT[tone], className)} aria-hidden />;
}

export function Verdict({ report }: { report: ToolReport }) {
  return (
    <div
      role="status"
      className={cn(
        "hf-rise relative mt-5 rounded-2xl border p-4 text-sm",
        TONE_BOX[report.tone]
      )}
    >
      <div className="flex items-start gap-3">
        <ToneIcon
          tone={report.tone}
          className="hf-pop mt-0.5 h-5 w-5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{report.verdict}</p>
          <p className="mt-1.5 font-medium opacity-90">
            <span className="font-extrabold">What this means: </span>
            {report.tip}
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <CopyResultsButton reports={[report]} />
      </div>
    </div>
  );
}

export function CopyResultsButton({
  reports,
  label = "Copy results for your ticket",
  className,
}: {
  reports: ToolReport[];
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  async function handleCopy() {
    const ok = await copyText(formatReports(reports));
    setState(ok ? "copied" : "failed");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2200);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 text-xs font-extrabold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40",
        className
      )}
    >
      {state === "copied" ? (
        <Check className="hf-pop h-4 w-4 text-[#5ee0a8]" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
      <span aria-live="polite">
        {state === "copied"
          ? "Copied!"
          : state === "failed"
            ? "Couldn't copy — select and copy manually"
            : label}
      </span>
    </button>
  );
}

export function ToolButton({
  variant = "primary",
  icon: Icon,
  spinning = false,
  children,
  className,
  ...props
}: {
  variant?: "primary" | "ghost" | "danger";
  icon?: LucideIcon;
  spinning?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  "aria-pressed"?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "group relative inline-flex min-h-11 items-center gap-2 overflow-hidden rounded-2xl px-4 text-sm font-extrabold transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
        variant === "primary" &&
          "hf-shimmer bg-[linear-gradient(110deg,#7c5cff,#c084fc,#7c5cff)] bg-[length:200%_100%] text-[#0d0a1c] shadow-[0_10px_30px_-10px_#7c5cff] focus-visible:ring-[#c084fc]/40",
        variant === "ghost" &&
          "border border-white/15 bg-white/10 text-white hover:bg-white/15 focus-visible:ring-white/30 aria-[pressed=true]:border-[#c9b8ff]/60 aria-[pressed=true]:bg-[#7c5cff]/30",
        variant === "danger" &&
          "border border-[#ff9bb3]/40 bg-[#ff9bb3]/15 text-[#ffe4ea] hover:bg-[#ff9bb3]/25 focus-visible:ring-[#ff9bb3]/40",
        className
      )}
    >
      {Icon && (
        <Icon
          className={cn("h-4 w-4", spinning && "animate-spin")}
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}

export function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  delay = 0,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  tone?: Tone;
  delay?: number;
}) {
  return (
    <div
      className="hf-pop min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3"
      style={{ animationDelay: `${delay}s` }}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/55">
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-[15px] font-extrabold tabular-nums",
          tone ? TONE_TEXT[tone] : "text-white/90"
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

/** Friendly empty/unsupported/error state inside a tool. */
export function ToolNotice({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "hf-rise flex items-start gap-3 rounded-2xl border p-4 text-sm",
        TONE_BOX[tone]
      )}
    >
      <ToneIcon tone={tone} className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-extrabold">{title}</p>
        {children && (
          <div className="mt-1 font-medium opacity-90">{children}</div>
        )}
      </div>
    </div>
  );
}

/** Placeholder shown before a tool has run. */
export function IdleHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-5 text-center text-sm font-semibold text-white/60">
      {children}
    </p>
  );
}
