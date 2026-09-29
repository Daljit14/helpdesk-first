"use client";

import { useState } from "react";
import type { ResolutionDailyPoint } from "@/lib/admin/operations-data";
import { smoothPath } from "./visuals";

type SeriesKey = "aiSolved" | "agentSolved" | "escalated";

const SERIES: {
  key: SeriesKey;
  label: string;
  color: string;
  gradient: string;
}[] = [
  {
    key: "aiSolved",
    label: "AI solved",
    color: "var(--adm-ai)",
    gradient: "hf-res-ai",
  },
  {
    key: "agentSolved",
    label: "Agent solved",
    color: "var(--adm-agent)",
    gradient: "hf-res-agent",
  },
  {
    key: "escalated",
    label: "Escalated",
    color: "var(--adm-esc)",
    gradient: "hf-res-esc",
  },
];

function dayLabel(day: string, isLast: boolean) {
  if (isLast) return "Today";
  const date = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Interactive stacked area chart of daily resolutions: AI, agent, escalated.
 * Hover (or focus + arrow keys) shows a crosshair and a per-day tooltip,
 * legend buttons toggle a series, and a 7D/14D switch changes the range.
 */
export function ResolutionChart({ daily }: { daily: ResolutionDailyPoint[] }) {
  const [range, setRange] = useState<7 | 14>(14);
  const [hidden, setHidden] = useState<Record<SeriesKey, boolean>>({
    aiSolved: false,
    agentSolved: false,
    escalated: false,
  });
  const [hover, setHover] = useState<number | null>(null);

  if (daily.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No resolution activity.
      </p>
    );
  }

  const data = daily.slice(-range);
  const n = data.length;
  const value = (point: ResolutionDailyPoint, key: SeriesKey) =>
    hidden[key] ? 0 : point[key];
  const stacks = data.map((point) => {
    const a = value(point, "aiSolved");
    const b = a + value(point, "agentSolved");
    const c = b + value(point, "escalated");
    return [a, b, c] as const;
  });
  const maxTotal = Math.max(4, ...stacks.map((s) => s[2]));
  const top = Math.ceil(maxTotal / 4) * 4;
  // Plot coordinates live in a 0–100 box; the SVG stretches to fill.
  const xAt = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const yAt = (v: number) => 100 - (v / top) * 100;
  const layer = (level: 0 | 1 | 2) =>
    stacks.map((s, i): [number, number] => [xAt(i), yAt(s[level])]);
  const lines = [layer(0), layer(1), layer(2)].map(smoothPath);
  const area = (line: string) => `${line} L100 100 L0 100 Z`;
  const totals = SERIES.map((series) =>
    data.reduce((sum, point) => sum + point[series.key], 0)
  );
  const grandTotal = totals.reduce((a, b) => a + b, 0);
  const every = n > 8 ? 3 : 1;
  const active = hover !== null && hover < n ? hover : null;
  const last = n - 1;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">
          <span className="mr-1 text-2xl font-extrabold text-foreground tabular-nums">
            {grandTotal}
          </span>
          solved in the last {n} {n === 1 ? "day" : "days"}
        </p>
        <div
          role="group"
          aria-label="Chart range"
          className="flex rounded-xl bg-muted p-1"
        >
          {([7, 14] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={range === option}
              onClick={() => {
                setRange(option);
                setHover(null);
              }}
              className={`h-8 rounded-lg px-3 text-xs font-extrabold transition-colors ${
                range === option
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option}D
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SERIES.map((series, index) => {
          const off = hidden[series.key];
          return (
            <button
              key={series.key}
              type="button"
              aria-pressed={!off}
              onClick={() =>
                setHidden((current) => ({ ...current, [series.key]: !off }))
              }
              className={`inline-flex h-8 items-center gap-2 rounded-full border border-border px-3 text-xs font-bold transition-transform hover:-translate-y-px ${
                off
                  ? "text-muted-foreground line-through"
                  : "bg-muted text-foreground"
              }`}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-[4px]"
                style={{ background: series.color, opacity: off ? 0.35 : 1 }}
              />
              {series.label}
              <span className="font-extrabold">{totals[index]}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <div
          aria-hidden
          className="relative h-56 w-7 shrink-0 text-[11px] font-bold text-muted-foreground"
        >
          {[0, 1, 2, 3, 4].map((k) => (
            <span
              key={k}
              className="absolute right-0 -translate-y-1/2 tabular-nums"
              style={{ top: `${100 - k * 25}%` }}
            >
              {(top * k) / 4}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            role="img"
            aria-label="Fourteen day resolution tracking chart"
            tabIndex={0}
            className="relative h-56 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onMouseLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const step = event.key === "ArrowRight" ? 1 : -1;
                setHover((current) =>
                  Math.min(last, Math.max(0, (current ?? last) + step))
                );
              }
            }}
          >
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="hf-adm-reveal absolute inset-0 h-full w-full overflow-visible"
              aria-hidden
            >
              <defs>
                {SERIES.map((series) => (
                  <linearGradient
                    key={series.gradient}
                    id={series.gradient}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0"
                      stopColor={series.color}
                      stopOpacity="0.9"
                    />
                    <stop
                      offset="1"
                      stopColor={series.color}
                      stopOpacity="0.4"
                    />
                  </linearGradient>
                ))}
              </defs>
              {[0, 25, 50, 75, 100].map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2="100"
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="3 5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <g>
                <path d={area(lines[2])} fill="url(#hf-res-esc)" />
                <path d={area(lines[1])} fill="url(#hf-res-agent)" />
                <path d={area(lines[0])} fill="url(#hf-res-ai)" />
                {[2, 1, 0].map((level) => (
                  <path
                    key={level}
                    d={lines[level]}
                    fill="none"
                    stroke={SERIES[level].color}
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      filter: `drop-shadow(0 0 4px ${SERIES[level].color})`,
                    }}
                  />
                ))}
              </g>
              {active !== null && (
                <line
                  x1={xAt(active)}
                  x2={xAt(active)}
                  y1="0"
                  y2="100"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            {/* Pulsing "today" point */}
            <span
              aria-hidden
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${xAt(last)}%`, top: `${yAt(stacks[last][2])}%` }}
            >
              <span className="hf-ping absolute inset-0 rounded-full bg-primary" />
              <span className="absolute inset-0 rounded-full border-[3px] border-primary bg-card" />
            </span>

            {active !== null && (
              <>
                <span
                  aria-hidden
                  className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-primary bg-card"
                  style={{
                    left: `${xAt(active)}%`,
                    top: `${yAt(stacks[active][2])}%`,
                  }}
                />
                <div
                  className="hf-adm-tip pointer-events-none absolute top-1 z-10 flex min-w-40 -translate-x-1/2 flex-col gap-1.5 rounded-2xl bg-foreground px-3 py-2.5 text-xs font-bold text-background shadow-lg"
                  style={{
                    left: `${Math.min(86, Math.max(14, xAt(active)))}%`,
                  }}
                >
                  <span className="text-[11px] opacity-75">
                    {dayLabel(data[active].day, active === last)}
                  </span>
                  {SERIES.map((series) => (
                    <span
                      key={series.key}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="flex items-center gap-1.5">
                        <i
                          className="h-2 w-2 rounded-[3px]"
                          style={{ background: series.color }}
                        />
                        {series.label}
                      </span>
                      <b>{data[active][series.key]}</b>
                    </span>
                  ))}
                  <span className="flex justify-between gap-4 border-t border-background/25 pt-1">
                    <span>Total</span>
                    <b>
                      {data[active].aiSolved +
                        data[active].agentSolved +
                        data[active].escalated}
                    </b>
                  </span>
                </div>
              </>
            )}

            {/* Invisible per-day hover columns */}
            <div aria-hidden className="absolute inset-0">
              {data.map((point, index) => {
                const width = n === 1 ? 100 : 100 / (n - 1);
                return (
                  <div
                    key={point.day}
                    className="absolute inset-y-0 cursor-crosshair"
                    style={{
                      left: `${Math.max(0, xAt(index) - width / 2)}%`,
                      width: `${width}%`,
                    }}
                    onMouseEnter={() => setHover(index)}
                  />
                );
              })}
            </div>
          </div>
          <div
            aria-hidden
            className="relative mt-2 h-4 text-[11px] font-bold text-muted-foreground"
          >
            {data.map((point, index) =>
              index % every === 0 || index === last ? (
                <span
                  key={point.day}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${xAt(index)}%` }}
                >
                  {dayLabel(point.day, index === last)}
                </span>
              ) : null
            )}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>Daily resolutions</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">AI solved</th>
            <th scope="col">Agent solved</th>
            <th scope="col">Escalated</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.day}>
              <th scope="row">{point.day}</th>
              <td>{point.aiSolved}</td>
              <td>{point.agentSolved}</td>
              <td>{point.escalated}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
