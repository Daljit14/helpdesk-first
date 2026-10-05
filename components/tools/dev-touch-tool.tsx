"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Eraser, Hand, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportLine, ToolReport } from "./diagnostics";
import { gridCoverage, missingCellLabels, touchVerdict } from "./dev-logic";
import { Panel, useSaveResult } from "./dev-shared";
import { StatTile, ToolButton, ToolCard, ToolNotice } from "./tool-shell";

const COLS = 6;
const ROWS = 4;
const CELLS = COLS * ROWS;
const COLORS = [
  "#c084fc",
  "#5ee0a8",
  "#ffd27c",
  "#9ee7ff",
  "#ff9bb3",
  "#a78bfa",
  "#fb923c",
  "#86efac",
  "#f0abfc",
  "#67e8f9",
];

type Support = "checking" | "yes" | "no";

export function DevTouchTool() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const active = useRef<Map<number, { x: number; y: number; color: string }>>(
    new Map()
  );
  const colorIndex = useRef(0);

  const [support, setSupport] = useState<Support>("checking");
  const [hardwarePoints, setHardwarePoints] = useState<number | null>(null);
  const [fingersNow, setFingersNow] = useState(0);
  const [maxTouches, setMaxTouches] = useState(0);
  const [strokes, setStrokes] = useState(0);
  const [hit, setHit] = useState<boolean[]>(() =>
    Array.from({ length: CELLS }, () => false)
  );
  const [pointerKinds, setPointerKinds] = useState<string[]>([]);

  useEffect(() => {
    queueMicrotask(() => {
      const points = navigator.maxTouchPoints ?? 0;
      setHardwarePoints(points);
      setSupport(points > 0 || "ontouchstart" in window ? "yes" : "no");
    });
  }, []);

  // Keep the canvas crisp and sized to its box.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || typeof ResizeObserver === "undefined") return;
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const coverage = useMemo(
    () => gridCoverage(CELLS, hit.filter(Boolean).length),
    [hit]
  );
  const touched = maxTouches > 0 || coverage.hit > 0;
  const verdict = touchVerdict({ maxTouches, coverage, touched });

  function point(e: React.PointerEvent<HTMLCanvasElement> | PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // some browsers throw for synthetic pointers; drawing still works
    }
    const isTouch = e.pointerType === "touch" || e.pointerType === "pen";
    const color = isTouch
      ? COLORS[colorIndex.current++ % COLORS.length]
      : "#8b80ad";
    const p = point(e);
    active.current.set(e.pointerId, { ...p, color });
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (isTouch) {
      const n = [...active.current.keys()].length;
      setFingersNow(n);
      setMaxTouches((m) => Math.max(m, n));
      setStrokes((s) => s + 1);
    }
    setPointerKinds((k) =>
      k.includes(e.pointerType) ? k : [...k, e.pointerType]
    );
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const a = active.current.get(e.pointerId);
    if (!a) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const events =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [];
    const list = events.length > 0 ? events : [e.nativeEvent];
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let prev = { x: a.x, y: a.y };
    for (const ev of list) {
      const p = point(ev);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      prev = p;
    }
    a.x = prev.x;
    a.y = prev.y;
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!active.current.delete(e.pointerId)) return;
    if (e.pointerType === "touch" || e.pointerType === "pen")
      setFingersNow(active.current.size);
  }

  function clearCanvas() {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
  }

  function resetAll() {
    clearCanvas();
    active.current.clear();
    colorIndex.current = 0;
    setFingersNow(0);
    setMaxTouches(0);
    setStrokes(0);
    setPointerKinds([]);
    setHit(Array.from({ length: CELLS }, () => false));
  }

  function markCell(i: number) {
    setHit((h) => (h[i] ? h : h.map((v, idx) => (idx === i ? true : v))));
  }

  const missing = missingCellLabels(COLS, hit);
  const lines: ReportLine[] = [
    [
      "Touch support",
      support === "yes"
        ? "Yes"
        : support === "no"
          ? "Not detected"
          : "Checking",
    ],
    [
      "Hardware touch points",
      hardwarePoints === null ? "Unknown" : String(hardwarePoints),
    ],
    ["Most fingers at once", String(maxTouches)],
    [
      "Dead-zone grid",
      `${coverage.hit} of ${coverage.total} squares responded (${coverage.percent}%)`,
    ],
    [
      "Unresponsive squares",
      missing.length === 0 || coverage.hit === 0
        ? "None recorded"
        : missing.join("; "),
    ],
  ];
  const report: ToolReport | null = touched
    ? {
        tool: "Touch screen",
        tone: verdict.tone,
        verdict: verdict.verdict,
        tip: verdict.tip,
        lines,
      }
    : null;
  useSaveResult("dev-touch", report);

  return (
    <ToolCard
      id="dev-touch"
      icon={Hand}
      title="Touch screen test"
      description="Draw with several fingers to check multi-touch, then tap every square to find dead zones."
      report={report}
      active={fingersNow > 0}
      live={
        coverage.hit === CELLS
          ? "All squares responded"
          : fingersNow > 0
            ? `${fingersNow} finger${fingersNow === 1 ? "" : "s"} down`
            : undefined
      }
      actions={
        <>
          <ToolButton variant="ghost" icon={Eraser} onClick={clearCanvas}>
            Clear drawing
          </ToolButton>
          <ToolButton variant="ghost" icon={RotateCcw} onClick={resetAll}>
            Reset test
          </ToolButton>
        </>
      }
    >
      {support === "no" && (
        <div className="mb-4">
          <ToolNotice
            tone="warn"
            title="No touch screen detected on this device"
          >
            This browser reports no touch points, so there is nothing to test.
            Open this page on a phone, tablet or touch laptop. You can still
            draw with a mouse or pen below to try the canvas.
          </ToolNotice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-3">
          <div
            ref={wrapRef}
            className="relative h-64 overflow-hidden rounded-[20px] border border-dashed border-[#c9b8ff]/40 bg-[#0a0716] sm:h-72"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgb(255_255_255/0.09)_1px,transparent_1px)] [background-size:18px_18px]"
            />
            <canvas
              ref={canvasRef}
              data-testid="touch-canvas"
              role="img"
              aria-label="Drawing area. Touch and drag with one or more fingers to draw coloured trails."
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className="absolute inset-0 h-full w-full touch-none select-none"
            />
            {strokes === 0 && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-semibold text-white/55">
                Put one, two, three or more fingers down and drag
              </p>
            )}
            {fingersNow > 0 && (
              <span className="hf-pop pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-extrabold backdrop-blur">
                {fingersNow} finger{fingersNow === 1 ? "" : "s"} down
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile label="Down now" value={String(fingersNow)} />
            <StatTile
              label="Most at once"
              value={String(maxTouches)}
              tone={maxTouches >= 2 ? "good" : undefined}
              delay={0.04}
            />
            <StatTile
              label="Hardware says"
              value={
                hardwarePoints === null
                  ? "-"
                  : hardwarePoints === 0
                    ? "none"
                    : `${hardwarePoints} max`
              }
              delay={0.08}
            />
          </div>
          {pointerKinds.length > 0 && (
            <p className="text-xs font-semibold text-white/55">
              Input types seen: {pointerKinds.join(", ")}
            </p>
          )}
        </div>

        <Panel title={`Dead-zone grid · ${coverage.hit}/${coverage.total}`}>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
            data-testid="touch-grid"
          >
            {hit.map((on, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={`Square row ${Math.floor(i / COLS) + 1}, column ${(i % COLS) + 1}${on ? ", responded" : ", not tapped yet"}`}
                onPointerDown={() => markCell(i)}
                onClick={(e) => {
                  if (e.detail === 0) markCell(i); // keyboard activation
                }}
                className={cn(
                  "flex h-11 touch-manipulation items-center justify-center rounded-lg border text-xs font-extrabold outline-none transition-colors duration-150 focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/50 sm:h-12",
                  on
                    ? "border-[#5ee0a8]/60 bg-[#5ee0a8]/30 text-[#d1fae5]"
                    : "border-white/15 bg-white/5 text-white/40 hover:bg-white/10"
                )}
              >
                {on ? <Check className="hf-pop h-4 w-4" aria-hidden /> : i + 1}
              </button>
            ))}
          </div>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#7c5cff,#5ee0a8)] transition-[width] duration-300"
              style={{ width: `${coverage.percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-white/60">
            Tap each square once. A square that stays grey after several taps is
            a dead zone.
          </p>
        </Panel>
      </div>
    </ToolCard>
  );
}
