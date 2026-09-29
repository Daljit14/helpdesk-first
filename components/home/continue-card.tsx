"use client";

import Link from "next/link";
import { History, RotateCcw, Wifi } from "lucide-react";
import { normalizePlatform, platformSlug } from "@/lib/platform";
import type { TroubleshootingSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export function ContinueCard({
  session,
  onClear,
  className,
}: {
  session: TroubleshootingSession;
  onClear: () => void;
  className?: string;
}) {
  return (
    <section
      aria-live="polite"
      aria-labelledby="continue-heading"
      className={cn(
        "hf-rise relative mt-8 overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#5b3cc4,#8b6cf6_60%,#c084fc)] p-6 text-white shadow-[var(--shadow-md)] sm:p-8",
        className
      )}
      style={{ animationDelay: "0.1s" }}
    >
      <span
        aria-hidden
        className="hf-blob-a absolute -top-20 right-24 h-64 w-64 rounded-full bg-white/10"
      />
      <span
        aria-hidden
        className="hf-blob-b absolute -bottom-28 left-1/3 h-60 w-60 rounded-full bg-pink-400/20"
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex max-w-xl flex-col gap-3">
          <span className="self-start rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold">
            Pick up where you left off
          </span>
          <h2
            id="continue-heading"
            className="text-2xl font-extrabold leading-tight sm:text-3xl"
          >
            {session.issueTitle}
          </h2>
          <p className="text-[15px] text-white/90">
            On {session.platform} · you were on step{" "}
            {session.currentStepIndex + 1}.
          </p>
          <div className="mt-1 flex flex-wrap gap-2.5">
            <Link
              href={`/issues/${session.issueSlug}/guide?platform=${platformSlug(normalizePlatform(session.platform) ?? "Other")}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 text-[15px] font-extrabold text-[#3b2a8f] shadow-sm hover:bg-white/90"
            >
              <History className="h-4 w-4" aria-hidden />
              Resume
            </Link>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/40 px-4 text-[15px] font-bold text-white hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Clear history
            </button>
          </div>
        </div>
        <div
          aria-hidden
          className="relative mx-auto h-40 w-40 shrink-0 sm:ml-auto sm:mr-0"
        >
          <svg viewBox="0 0 200 200" className="h-full w-full">
            <circle
              cx="100"
              cy="100"
              r="68"
              fill="none"
              stroke="rgb(255 255 255 / 0.2)"
              strokeWidth="14"
            />
            <circle
              cx="100"
              cy="100"
              r="68"
              fill="none"
              stroke="#fff"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray="120 428"
              className="hf-spin-slow origin-center"
              style={{
                animationDuration: "6s",
                transformBox: "fill-box",
              }}
            />
          </svg>
          <Wifi className="hf-bob absolute inset-0 m-auto h-10 w-10" />
        </div>
      </div>
    </section>
  );
}
