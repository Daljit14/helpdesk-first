"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Sample } from "./net-sec-logic";
import { sparkPoints } from "./net-sec-logic";

export const fieldClass =
  "min-h-11 w-full rounded-2xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white placeholder:text-white/40 focus-visible:border-[#c9b8ff]/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/30";

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "hf-rise rounded-2xl border border-white/10 bg-white/5 p-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-wide text-white/55">
      {children}
    </p>
  );
}

/** Thin progress bar (0..1). */
export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-2 overflow-hidden rounded-full bg-white/10"
    >
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,#7c5cff,#d946ef)] transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export type ChartSeries = { name: string; color: string; samples: Sample[] };

/** Live latency chart. Lost probes show as red ticks along the bottom. */
export function LatencyChart({
  series,
  maxPoints = 30,
  label,
}: {
  series: ChartSeries[];
  maxPoints?: number;
  label: string;
}) {
  const W = 300;
  const H = 80;
  const all = series.flatMap((s) =>
    s.samples.slice(-maxPoints).filter((v): v is number => v !== null)
  );
  const yMax = Math.max(100, ...all);
  return (
    <figure className="m-0">
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-28 w-full overflow-visible rounded-xl bg-black/20"
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={H * f}
            y2={H * f}
            stroke="rgb(255 255 255 / 0.07)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {series.map((s) => {
          const { points, lost } = sparkPoints(
            s.samples,
            W,
            H,
            maxPoints,
            yMax
          );
          const d = points
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`
            )
            .join(" ");
          const last = points[points.length - 1];
          return (
            <g key={s.name}>
              {d && (
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {lost.map((x) => (
                <line
                  key={x}
                  x1={x}
                  x2={x}
                  y1={H - 10}
                  y2={H}
                  stroke="#ff9bb3"
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {last && (
                <circle
                  cx={last.x}
                  cy={last.y}
                  r="3"
                  fill={s.color}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-white/65">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2 w-4 rounded-full"
              style={{ background: s.color }}
            />
            {s.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-1 rounded-sm bg-[#ff9bb3]" />
          Lost reply
        </span>
        <span className="ml-auto tabular-nums">
          Scale 0–{Math.round(yMax)} ms
        </span>
      </figcaption>
    </figure>
  );
}

const SEV_STYLE = {
  high: "border-[#ff9bb3]/40 bg-[#ff9bb3]/10 text-[#ffe4ea]",
  medium: "border-[#ffd27c]/40 bg-[#ffd27c]/10 text-[#fef3c7]",
  low: "border-white/15 bg-white/5 text-white/80",
} as const;
const SEV_LABEL = { high: "High", medium: "Medium", low: "Minor" } as const;

export function ReasonList({
  items,
}: {
  items: { severity: "high" | "medium" | "low"; text: string }[];
}) {
  return (
    <ul className="grid gap-2">
      {items.map((r, i) => (
        <li
          key={`${i}-${r.text}`}
          className={cn(
            "hf-rise flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium",
            SEV_STYLE[r.severity]
          )}
          style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}
        >
          <span className="mt-0.5 shrink-0 rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
            {SEV_LABEL[r.severity]}
          </span>
          <span className="min-w-0 break-words">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Segmented meter, `score` 0..segments-1 lights up that many + 1 segments. */
export function SegmentMeter({
  filled,
  total,
  tone,
  label,
}: {
  filled: number;
  total: number;
  tone: "good" | "warn" | "bad" | "info";
  label: string;
}) {
  const color = {
    good: "#5ee0a8",
    warn: "#ffd27c",
    bad: "#ff9bb3",
    info: "#9ee7ff",
  }[tone];
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={filled}
      className="flex gap-1.5"
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="h-2.5 flex-1 rounded-full transition-all duration-500"
          style={{
            background: i < filled ? color : "rgb(255 255 255 / 0.12)",
            boxShadow: i < filled ? `0 0 12px -2px ${color}` : "none",
          }}
        />
      ))}
    </div>
  );
}
