"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Headset,
  Lightbulb,
  ListChecks,
  MessagesSquare,
  Search,
  Ticket,
} from "lucide-react";
import { AnimatedAvatar } from "@/components/avatar/animated-avatar";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    title: "Describe it",
    body: "Type the problem in your own words, or pick a category.",
    icon: Search,
  },
  {
    title: "Follow safe steps",
    body: "One step at a time, made for your device.",
    icon: ListChecks,
  },
  {
    title: "Fixed, or get a person",
    body: "Still broken? Send a ticket — your steps go with it.",
    icon: Ticket,
  },
];

/** Three-step explainer; the highlighted step cycles every two seconds. */
export function HowItWorks({ className }: { className?: string }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setActive((value) => (value + 1) % STEPS.length),
      2000
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <section
      aria-labelledby="how-it-works-heading"
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-border bg-card p-7 shadow-sm",
        className
      )}
    >
      <h2 id="how-it-works-heading" className="text-lg font-extrabold">
        How HelpDesk First works
      </h2>
      <svg
        aria-hidden
        className="pointer-events-none absolute left-0 top-[104px] hidden h-1 w-full overflow-visible sm:block"
      >
        <line
          x1="12%"
          y1="2"
          x2="80%"
          y2="2"
          stroke="var(--secondary)"
          strokeWidth={2}
          strokeDasharray="6 6"
          className="hf-dash"
        />
      </svg>
      <ol className="relative mt-6 grid gap-6 sm:grid-cols-3">
        {STEPS.map(({ title, body, icon: Icon }, index) => (
          <li key={title} className="flex flex-col items-start gap-2.5">
            <span
              key={active === index ? `on-${title}` : `off-${title}`}
              className={cn(
                "flex h-[52px] w-[52px] items-center justify-center rounded-2xl",
                active === index
                  ? "hf-pop bg-primary text-primary-foreground shadow-[0_12px_24px_-10px_var(--primary)]"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <span className="text-xs font-extrabold text-muted-foreground">
              Step {index + 1}
            </span>
            <span className="text-base font-extrabold">{title}</span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              {body}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const TIPS = [
  "Restarting fixes more problems than you’d think — try it before anything else.",
  "Note any error code on screen. It helps the guide (and IT) pinpoint the issue fast.",
  "On a work laptop, don’t change settings you aren’t allowed to — open a ticket instead.",
  "Wi-Fi acting up? Forgetting the network and rejoining often clears it.",
];

/** Rotating quick tips; pauses while hovered or focused. */
export function QuickTips({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(
      () => setIndex((value) => (value + 1) % TIPS.length),
      5000
    );
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <section
      aria-labelledby="quick-tip-heading"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "flex flex-col gap-3 rounded-[28px] border border-[#f7e3d2] bg-[linear-gradient(150deg,#fff7e6,#fff0f6)] p-6 text-[#3b2a1a] dark:border-[#4a3520] dark:bg-[linear-gradient(150deg,#2e2214,#2e1a28)] dark:text-[#ffe9c9]",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <h2
          id="quick-tip-heading"
          className="inline-flex items-center gap-2 text-sm font-extrabold text-[#8a5200] dark:text-[#ffd68a]"
        >
          <Lightbulb className="hf-glow h-[18px] w-[18px]" aria-hidden />
          Quick tip
        </h2>
        <span className="text-xs font-bold opacity-80">
          {index + 1} / {TIPS.length}
        </span>
      </div>
      <p
        key={index}
        aria-live="polite"
        className="hf-swap min-h-24 text-base font-semibold leading-relaxed"
      >
        {TIPS[index]}
      </p>
      <div className="flex items-center gap-1.5">
        {TIPS.map((tip, i) => (
          <button
            key={tip}
            type="button"
            aria-label={`Show tip ${i + 1}`}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
            className="flex h-6 flex-1 items-center"
          >
            <span className="relative block h-1 w-full overflow-hidden rounded-full bg-[#f3dcc3] dark:bg-[#4a3520]">
              {i === index && (
                <span
                  key={`${index}-${paused}`}
                  className="absolute inset-0 origin-left rounded-full bg-[#f59e0b]"
                  style={{
                    animation: paused ? undefined : "hf-fill 5s linear both",
                  }}
                />
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Replaces the old status card on the home page: a friendly "still stuck?" CTA. */
export function StillStuckCard({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="still-stuck-heading"
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-[28px] border border-border bg-[linear-gradient(150deg,#efe9ff,#fde7f6)] p-6 dark:bg-[linear-gradient(150deg,#241c45,#2e1a36)]",
        className
      )}
    >
      <span
        aria-hidden
        className="hf-blob-a pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[radial-gradient(closest-side,rgb(124_92_255/0.3),transparent)]"
      />
      <div className="relative flex items-center gap-3">
        <AnimatedAvatar id="bot" size={44} />
        <div>
          <h2 id="still-stuck-heading" className="text-base font-extrabold">
            Still stuck?
          </h2>
          <p className="text-sm text-muted-foreground">
            Chat with the assistant, or hand it to a real person.
          </p>
        </div>
      </div>
      <div className="relative flex flex-wrap gap-2">
        <Link
          href="/assistant"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px"
        >
          <MessagesSquare className="h-4 w-4" aria-hidden />
          Start a chat
        </Link>
        <Link
          href="/assistant?intent=human"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-extrabold transition-colors hover:bg-muted"
        >
          <Headset className="h-4 w-4" aria-hidden />
          Talk to a person
        </Link>
      </div>
    </section>
  );
}
