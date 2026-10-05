"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  collectDeviceInfo,
  formatReport,
  type ToolReport,
} from "./diagnostics";
import { saveToolResult } from "./tool-results-store";

/**
 * Small helpers shared by the dev-*, print-* and support-* tools.
 * Visual primitives deliberately reuse the dark "aurora" look of tool-shell.
 */

/** Saves the latest report so the Support report builder can include it. */
export function useSaveResult(
  id: string,
  report: ToolReport | null,
  enabled = true
) {
  const summary = report && enabled ? formatReport(report) : null;
  const title = report?.tool;
  useEffect(() => {
    if (summary) saveToolResult(id, summary, title);
  }, [id, summary, title]);
}

export type Env = {
  os: string;
  browser: string;
  browserVersion: string;
  mobile: boolean;
};

/** Browser + OS, detected after mount so server and client markup match. */
export function useEnv(): Env | null {
  const [env, setEnv] = useState<Env | null>(null);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const i = collectDeviceInfo();
        setEnv({
          os: i.os,
          browser: i.browser,
          browserVersion: i.browserVersion,
          mobile: i.mobile,
        });
      } catch {
        setEnv({
          os: "Unknown",
          browser: "Unknown browser",
          browserVersion: "",
          mobile: false,
        });
      }
    });
  }, []);
  return env;
}

export function Panel({
  title,
  icon,
  children,
  className,
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4",
        className
      )}
    >
      {title && (
        <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/55">
          {icon}
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

export function StepList({
  steps,
  className,
}: {
  steps: string[];
  className?: string;
}) {
  return (
    <ol className={cn("grid gap-2 text-sm text-white/85", className)}>
      {steps.map((s, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            aria-hidden
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#7c5cff]/40 text-[11px] font-extrabold text-white"
          >
            {i + 1}
          </span>
          <span className="min-w-0 font-medium">{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad" | "muted";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold",
        tone === "good" && "border-[#5ee0a8]/40 bg-[#5ee0a8]/15 text-[#5ee0a8]",
        tone === "warn" && "border-[#ffd27c]/40 bg-[#ffd27c]/15 text-[#ffd27c]",
        tone === "bad" && "border-[#ff9bb3]/40 bg-[#ff9bb3]/15 text-[#ff9bb3]",
        tone === "muted" && "border-white/15 bg-white/5 text-white/60"
      )}
    >
      {children}
    </span>
  );
}

export function Meter({
  percent,
  label,
  className,
}: {
  percent: number;
  label: string;
  className?: string;
}) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      className={cn(
        "h-2.5 overflow-hidden rounded-full bg-white/10",
        className
      )}
    >
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,#5ee0a8,#ffd27c_70%,#ff9bb3)] transition-[width] duration-100"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

/** Race a promise against a timeout. Rejects with an Error named "TimeoutError". */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => {
      const err = new Error("Timed out");
      err.name = "TimeoutError";
      reject(err);
    }, ms);
    promise.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(id);
        reject(e);
      }
    );
  });
}
