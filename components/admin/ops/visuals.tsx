"use client";

import { useEffect, useRef, useState } from "react";

/** True when the browser supports motion and the user has not asked to reduce it. */
export function canAnimate() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia !== "function") return false;
  if (typeof window.requestAnimationFrame !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function format(value: number, decimals: number) {
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}

/**
 * Counts a number up from zero the first time it mounts. Server render and
 * later refreshes always show the real value, so data is never hidden.
 */
export function CountUp({
  value,
  decimals = 0,
  suffix = "",
  durationMs = 1400,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  durationMs?: number;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !canAnimate()) return;
    started.current = true;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(t >= 1 ? null : eased);
      if (t < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [durationMs]);

  const shown = progress === null ? value : value * progress;
  return (
    <>
      {format(shown, decimals)}
      {suffix}
    </>
  );
}

/** Small trend line with a soft gradient fill and a pulsing last point. */
export function Sparkline({
  points,
  id,
  width = 104,
  height = 38,
}: {
  points: number[];
  id: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const xy = points.map((value, index): [number, number] => [
    (index * width) / (points.length - 1),
    height - 5 - ((value - min) / (max - min || 1)) * (height - 12),
  ]);
  const line = smoothPath(xy);
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      className="shrink-0 overflow-visible"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${line} L${width} ${height} L0 ${height} Z`}
        fill={`url(#${id})`}
        className="hf-adm-reveal"
      />
      <path
        d={line}
        pathLength={100}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="hf-adm-draw"
      />
      <circle cx={lx} cy={ly} r={3.5} fill="var(--primary)" />
      <circle
        cx={lx}
        cy={ly}
        r={3.5}
        fill="var(--primary)"
        className="hf-ping"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
    </svg>
  );
}

export type DonutSlice = { label: string; value: number; color: string };

/** Animated ring chart; the centre shows a headline number. */
export function Donut({
  slices,
  center,
  caption,
  label,
}: {
  slices: DonutSlice[];
  center: React.ReactNode;
  caption: string;
  label: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const segments = slices.reduce<
    { slice: DonutSlice; length: number; offset: number }[]
  >((acc, slice) => {
    const length = total > 0 ? (slice.value / total) * 100 : 0;
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    acc.push({ slice, length, offset });
    return acc;
  }, []);
  return (
    <div role="img" aria-label={label} className="relative h-36 w-36 shrink-0">
      <svg
        viewBox="0 0 42 42"
        className="hf-adm-spin-in h-full w-full -rotate-90"
        aria-hidden
      >
        <circle
          cx="21"
          cy="21"
          r="15.9155"
          fill="none"
          stroke="var(--muted)"
          strokeWidth="5"
        />
        {segments.map(({ slice, length, offset }) =>
          length > 0 ? (
            <circle
              key={slice.label}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              stroke={slice.color}
              strokeWidth="5"
              strokeDasharray={`${Math.max(0, length - 1.5)} ${100 - Math.max(0, length - 1.5)}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          ) : null
        )}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold tabular-nums">{center}</span>
        <span className="text-[11px] font-bold text-muted-foreground">
          {caption}
        </span>
      </span>
    </div>
  );
}

/**
 * Smooth path through points (Catmull-Rom → cubic Bézier) with control points
 * clamped between neighbours so the curve never overshoots the data.
 */
export function smoothPath(points: [number, number][]) {
  if (points.length === 0) return "";
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const clamp = (y: number) => Math.min(hi, Math.max(lo, y));
    const c1: [number, number] = [
      p1[0] + (p2[0] - p0[0]) / 6,
      clamp(p1[1] + (p2[1] - p0[1]) / 6),
    ];
    const c2: [number, number] = [
      p2[0] - (p3[0] - p1[0]) / 6,
      clamp(p2[1] - (p3[1] - p1[1]) / 6),
    ];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
