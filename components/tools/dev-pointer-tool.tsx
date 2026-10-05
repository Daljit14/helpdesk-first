"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  MousePointer2,
  Play,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportLine, ToolReport } from "./diagnostics";
import {
  analyzeClicks,
  analyzeWheel,
  DOUBLE_CLICK_MS,
  jitterStats,
  pointerVerdict,
  type ClickSample,
  type JitterStats,
  type PointSample,
  type WheelEventLike,
} from "./dev-logic";
import { Panel, Pill, useSaveResult } from "./dev-shared";
import { StatTile, ToolButton, ToolCard, ToolNotice } from "./tool-shell";

const BUTTON_BIT: Record<number, number> = { 0: 1, 1: 4, 2: 2, 3: 8, 4: 16 };
const BUTTON_NAME: Record<number, string> = {
  0: "Left",
  1: "Middle",
  2: "Right",
  3: "Back",
  4: "Forward",
};

function maskToButtons(mask: number): number[] {
  return [0, 1, 2, 3, 4].filter((b) => (mask & BUTTON_BIT[b]) !== 0);
}

type Phase = "idle" | "ready" | "recording" | "done";
type Ripple = { id: number; x: number; y: number };

const READY_MS = 2000;
const RECORD_MS = 4000;

export function DevPointerTool() {
  const padRef = useRef<HTMLDivElement | null>(null);
  const [down, setDown] = useState<number[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [clickLog, setClickLog] = useState<ClickSample[]>([]);
  const [doubleMs, setDoubleMs] = useState(DOUBLE_CLICK_MS);
  const [wheelLog, setWheelLog] = useState<WheelEventLike[]>([]);
  const [wheelPulse, setWheelPulse] = useState<{
    dir: "up" | "down" | "left" | "right";
    n: number;
  } | null>(null);
  const [pointerType, setPointerType] = useState<string>("-");
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [fineChecked, setFineChecked] = useState(false);
  const [finePointer, setFinePointer] = useState(true);

  const [drag, setDrag] = useState<{
    pos: number;
    active: boolean;
    ok: number;
    early: number;
  }>({
    pos: 0,
    active: false,
    ok: 0,
    early: 0,
  });
  const dragRef = useRef<{ left: number; width: number; grabX: number } | null>(
    null
  );

  const [phase, setPhase] = useState<Phase>("idle");
  const [jitter, setJitter] = useState<JitterStats | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const lastPos = useRef<PointSample | null>(null);
  const jitterPoints = useRef<PointSample[]>([]);
  const timers = useRef<number[]>([]);
  const posRaf = useRef(0);
  const posNext = useRef<{ x: number; y: number } | null>(null);

  const clicks = useMemo(
    () => analyzeClicks(clickLog, doubleMs),
    [clickLog, doubleMs]
  );
  const wheel = useMemo(() => analyzeWheel(wheelLog), [wheelLog]);

  const lastClick = clickLog[clickLog.length - 1];
  let lastGap: number | null = null;
  if (lastClick) {
    for (let i = clickLog.length - 2; i >= 0; i--) {
      if (clickLog[i].button === lastClick.button) {
        lastGap = Math.round(lastClick.t - clickLog[i].t);
        break;
      }
    }
  }

  // Capability + cleanup
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setFinePointer(window.matchMedia?.("(pointer: fine)").matches ?? true);
      } catch {
        setFinePointer(true);
      }
      setFineChecked(true);
    });
    const pending = timers;
    return () => {
      pending.current.forEach((t) => window.clearTimeout(t));
      pending.current = [];
      if (posRaf.current) cancelAnimationFrame(posRaf.current);
    };
  }, []);

  // Wheel needs a non-passive listener so the page does not scroll while testing.
  useEffect(() => {
    const el = padRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const sample: WheelEventLike = {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        t: e.timeStamp,
      };
      setWheelLog((l) => [...l.slice(-199), sample]);
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const dir = horizontal
        ? e.deltaX > 0
          ? "right"
          : "left"
        : e.deltaY > 0
          ? "down"
          : "up";
      setWheelPulse((p) => ({ dir, n: (p?.n ?? 0) + 1 }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Releasing outside the pad must still un-light the buttons.
  useEffect(() => {
    const onUp = (e: PointerEvent) => setDown(maskToButtons(e.buttons));
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Hold-still test listens to the whole window.
  useEffect(() => {
    if (phase !== "ready" && phase !== "recording") return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const p = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      lastPos.current = p;
      if (phaseRef.current === "recording") jitterPoints.current.push(p);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [phase]);

  function go(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function startHold() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    jitterPoints.current = [];
    setJitter(null);
    go("ready");
    timers.current.push(
      window.setTimeout(() => {
        jitterPoints.current = lastPos.current ? [lastPos.current] : [];
        go("recording");
      }, READY_MS),
      window.setTimeout(() => {
        setJitter(jitterStats(jitterPoints.current));
        go("done");
      }, READY_MS + RECORD_MS)
    );
  }

  function reset() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    jitterPoints.current = [];
    setDown([]);
    setCounts({});
    setClickLog([]);
    setWheelLog([]);
    setWheelPulse(null);
    setRipples([]);
    setDrag({ pos: 0, active: false, ok: 0, early: 0 });
    setJitter(null);
    go("idle");
  }

  function schedulePos(x: number, y: number) {
    posNext.current = { x, y };
    if (posRaf.current) return;
    posRaf.current = requestAnimationFrame(() => {
      posRaf.current = 0;
      if (posNext.current) setPos(posNext.current);
    });
  }

  function onPadDown(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setDown(maskToButtons(e.buttons || BUTTON_BIT[e.button] || 0));
    setCounts((c) => ({ ...c, [e.button]: (c[e.button] ?? 0) + 1 }));
    setClickLog((l) => [...l.slice(-99), { button: e.button, t: e.timeStamp }]);
    setPointerType(e.pointerType || "-");
    setRipples((r) => [
      ...r.slice(-5),
      {
        id: Math.round(e.timeStamp * 1000),
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      },
    ]);
  }

  function onPadMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    schedulePos(
      Math.round(e.clientX - rect.left),
      Math.round(e.clientY - rect.top)
    );
    if (e.buttons !== 0) setDown(maskToButtons(e.buttons));
    setPointerType((t) =>
      t === (e.pointerType || "-") ? t : e.pointerType || "-"
    );
  }

  /* Drag test */
  function onHandleDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const track = e.currentTarget.parentElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const handleRect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      left: rect.left,
      width: rect.width - handleRect.width,
      grabX: e.clientX - handleRect.left,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag((d) => ({ ...d, active: true }));
  }
  function onHandleMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const p = Math.max(
      0,
      Math.min(1, (e.clientX - d.left - d.grabX) / Math.max(1, d.width))
    );
    setDrag((s) => ({ ...s, pos: p }));
  }
  function onHandleUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDrag((s) =>
      s.pos >= 0.97
        ? { pos: 1, active: false, ok: s.ok + 1, early: s.early }
        : { pos: 0, active: false, ok: s.ok, early: s.early + 1 }
    );
  }

  const dragged = drag.ok > 0;
  const verdict = pointerVerdict({ clicks, wheel, jitter, dragged });
  const tested =
    clicks.total > 0 ||
    wheel.events > 0 ||
    drag.ok + drag.early > 0 ||
    jitter !== null;

  const lines: ReportLine[] = [
    [
      "Buttons seen",
      clicks.buttonsSeen.length
        ? clicks.buttonsSeen
            .map((b) => BUTTON_NAME[b] ?? `Button ${b}`)
            .join(", ")
        : "None yet",
    ],
    ["Clicks", String(clicks.total)],
    ["Intentional double-clicks", `${clicks.doubles} (window ${doubleMs} ms)`],
    ["Accidental repeats (< 60 ms)", String(clicks.bounces)],
    [
      "Fastest repeat",
      clicks.fastestGapMs === null
        ? "n/a"
        : `${Math.round(clicks.fastestGapMs)} ms`,
    ],
    [
      "Wheel",
      wheel.events
        ? `${wheel.direction}, up to ${wheel.peakSpeed} lines/s, ${wheel.reversals} reversal(s)`
        : "Not tested",
    ],
    [
      "Drag test",
      drag.ok + drag.early === 0
        ? "Not tested"
        : `${drag.ok} completed, ${drag.early} released early`,
    ],
    [
      "Hold-still drift",
      jitter
        ? `${jitter.level} (max ${jitter.maxDeviation} px, ${jitter.samples} samples)`
        : "Not tested",
    ],
  ];
  const report: ToolReport | null = tested
    ? {
        tool: "Mouse & trackpad",
        tone: verdict.tone,
        verdict: verdict.verdict,
        tip: verdict.tip,
        lines,
      }
    : null;
  useSaveResult("dev-pointer", report);

  const left = down.includes(0);
  const right = down.includes(2);
  const middle = down.includes(1);
  const back = down.includes(3);
  const forward = down.includes(4);

  return (
    <ToolCard
      id="dev-pointer"
      icon={MousePointer2}
      title="Mouse & trackpad test"
      description="Click every button, scroll the wheel, drag the handle and check for drifting. Nothing leaves this page."
      report={report}
      active={phase === "recording"}
      live={
        phase === "ready"
          ? "Get ready: put the pointer on the pad and let go of the mouse"
          : phase === "recording"
            ? "Recording. Keep your hands off the mouse"
            : phase === "done" && jitter
              ? `Hold-still test finished: ${jitter.level} movement`
              : undefined
      }
      actions={
        <ToolButton variant="ghost" icon={RotateCcw} onClick={reset}>
          Reset
        </ToolButton>
      }
    >
      {fineChecked && !finePointer && (
        <div className="mb-4">
          <ToolNotice title="This looks like a touch-only device">
            Connect a mouse or use a laptop with a trackpad to test buttons and
            scrolling. You can still try the drag test with your finger.
          </ToolNotice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          <div
            ref={padRef}
            data-testid="pointer-pad"
            aria-label="Test pad. Click, scroll and move here."
            role="group"
            tabIndex={0}
            onPointerDown={onPadDown}
            onPointerMove={onPadMove}
            onPointerLeave={() => setPos(null)}
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault();
            }}
            onAuxClick={(e) => e.preventDefault()}
            className="relative flex min-h-60 cursor-crosshair touch-none select-none items-center justify-center overflow-hidden rounded-[20px] border border-dashed border-[#c9b8ff]/40 bg-[#0a0716] outline-none [overscroll-behavior:contain] focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgb(255_255_255/0.09)_1px,transparent_1px)] [background-size:18px_18px]"
            />
            {ripples.map((r) => (
              <span
                key={r.id}
                aria-hidden
                onAnimationEnd={() =>
                  setRipples((all) => all.filter((x) => x.id !== r.id))
                }
                className="hf-dt-ripple pointer-events-none absolute h-16 w-16 rounded-full border-2 border-[#c9b8ff]"
                style={{ left: r.x - 32, top: r.y - 32 }}
              />
            ))}

            <MouseGraphic
              left={left}
              right={right}
              middle={middle}
              back={back}
              forward={forward}
              wheel={wheelPulse}
            />

            <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-xs font-semibold text-white/55">
              {pos
                ? `x ${pos.x}  y ${pos.y} · ${pointerType}`
                : "Click, right-click, middle-click and scroll here"}
            </p>
          </div>

          <Panel title="Drag test">
            <div
              className="relative h-12 rounded-xl border border-white/10 bg-[#0a0716]"
              data-testid="drag-track"
            >
              <div
                aria-hidden
                className="absolute inset-y-0 left-3 flex items-center text-[11px] font-bold uppercase tracking-wide text-white/40"
              >
                {dragged ? (
                  <span className="hf-pop inline-flex items-center gap-1 text-[#5ee0a8]">
                    <Check className="h-4 w-4" /> Drag worked
                  </span>
                ) : (
                  "drag to the right"
                )}
              </div>
              <div
                role="button"
                tabIndex={0}
                aria-label="Drag test handle. Press and drag to the right end, then release."
                onPointerDown={onHandleDown}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                data-active={drag.active}
                className={cn(
                  "absolute inset-y-1 left-1 flex w-14 cursor-grab touch-none select-none items-center justify-center rounded-lg bg-[linear-gradient(110deg,#7c5cff,#c084fc)] text-xs font-extrabold text-[#0d0a1c] shadow-[0_6px_20px_-8px_#7c5cff] outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/50 data-[active=true]:cursor-grabbing data-[active=true]:scale-105",
                  !drag.active && "transition-[left] duration-300"
                )}
                style={{ left: `calc(4px + (100% - 64px) * ${drag.pos})` }}
              >
                drag
              </div>
            </div>
            <p className="mt-2 text-xs font-semibold text-white/60">
              Hold the left button, slide to the end, release. Dropping early
              means the button let go mid-drag.
            </p>
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile label="Clicks" value={String(clicks.total)} />
            <StatTile
              label="Last repeat gap"
              value={lastGap === null ? "-" : `${lastGap} ms`}
              tone={lastGap !== null && lastGap < 60 ? "warn" : undefined}
              delay={0.04}
            />
            <StatTile
              label="Double-clicks"
              value={String(clicks.doubles)}
              delay={0.08}
            />
            <StatTile
              label="Accidental repeats"
              value={String(clicks.bounces)}
              tone={
                clicks.bounces > 0
                  ? "warn"
                  : clicks.total > 0
                    ? "good"
                    : undefined
              }
              delay={0.12}
            />
          </div>

          <Panel title="Buttons">
            <ul
              className="flex flex-wrap gap-1.5"
              aria-label="Buttons registered so far"
            >
              {[0, 1, 2, 3, 4].map((b) => (
                <li key={b}>
                  <Pill tone={(counts[b] ?? 0) > 0 ? "good" : "muted"}>
                    {(counts[b] ?? 0) > 0 && (
                      <Check className="h-3 w-3" aria-hidden />
                    )}
                    {BUTTON_NAME[b]}{" "}
                    {(counts[b] ?? 0) > 0 ? `× ${counts[b]}` : ""}
                  </Pill>
                </li>
              ))}
            </ul>
            <label className="mt-3 grid gap-1.5 text-xs font-bold text-white/70">
              <span className="flex justify-between">
                Double-click window{" "}
                <span className="tabular-nums text-white">{doubleMs} ms</span>
              </span>
              <input
                type="range"
                min={200}
                max={900}
                step={50}
                value={doubleMs}
                onChange={(e) => setDoubleMs(Number(e.target.value))}
                className="h-2 w-full accent-[#a78bfa]"
              />
            </label>
          </Panel>

          <Panel title="Scroll wheel">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-[#c9b8ff]"
              >
                {wheel.direction === "up" ? (
                  <ArrowUp
                    key={wheelPulse?.n}
                    className="hf-dt-nudge h-5 w-5"
                  />
                ) : wheel.direction === "down" ? (
                  <ArrowDown
                    key={wheelPulse?.n}
                    className="hf-dt-nudge h-5 w-5"
                  />
                ) : wheel.direction === "left" ? (
                  <ArrowLeft
                    key={wheelPulse?.n}
                    className="hf-dt-nudge h-5 w-5"
                  />
                ) : wheel.direction === "right" ? (
                  <ArrowRight
                    key={wheelPulse?.n}
                    className="hf-dt-nudge h-5 w-5"
                  />
                ) : (
                  <span className="text-lg font-extrabold">-</span>
                )}
              </span>
              <p className="min-w-0 text-sm font-semibold text-white/85">
                {wheel.events === 0
                  ? "Scroll over the pad to test."
                  : `Mostly scrolling ${wheel.direction}, up to ${wheel.peakSpeed} lines/s${
                      wheel.reversals > 0
                        ? `, ${wheel.reversals} backwards jump${wheel.reversals === 1 ? "" : "s"}`
                        : ""
                    }.`}
              </p>
            </div>
          </Panel>

          <Panel title="Hold-still test (drift)">
            <p className="text-sm text-white/75">
              Rest the pointer on the pad, let go of the mouse for{" "}
              {RECORD_MS / 1000} seconds and see whether it moves on its own.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ToolButton
                variant="ghost"
                icon={phase === "done" ? RotateCcw : Play}
                onClick={startHold}
                disabled={phase === "ready" || phase === "recording"}
              >
                {phase === "done" ? "Run again" : "Start hold-still test"}
              </ToolButton>
              <p className="min-w-0 text-sm font-bold" aria-hidden>
                {phase === "ready" && (
                  <span className="text-[#ffd27c]">
                    Get ready... put the pointer down and let go
                  </span>
                )}
                {phase === "recording" && (
                  <span className="text-[#ff9bb3]">Recording - hands off!</span>
                )}
                {phase === "done" && jitter && (
                  <span
                    className={
                      jitter.level === "none" || jitter.level === "tiny"
                        ? "text-[#5ee0a8]"
                        : "text-[#ffd27c]"
                    }
                  >
                    {jitter.level === "none"
                      ? "Rock steady (no movement)"
                      : `Moved up to ${jitter.maxDeviation} px (${jitter.level})`}
                  </span>
                )}
              </p>
            </div>
            {(phase === "ready" || phase === "recording") && (
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
                aria-hidden
              >
                <div
                  key={phase}
                  className="hf-dt-bar h-full rounded-full bg-[linear-gradient(90deg,#7c5cff,#c084fc)]"
                  style={{
                    animationDuration: `${phase === "ready" ? READY_MS : RECORD_MS}ms`,
                  }}
                />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </ToolCard>
  );
}

function MouseGraphic({
  left,
  right,
  middle,
  back,
  forward,
  wheel,
}: {
  left: boolean;
  right: boolean;
  middle: boolean;
  back: boolean;
  forward: boolean;
  wheel: { dir: "up" | "down" | "left" | "right"; n: number } | null;
}) {
  const lit = "fill-[#a78bfa] stroke-[#e9ddff]";
  const unlit = "fill-white/10 stroke-white/30";
  return (
    <svg
      viewBox="0 0 120 170"
      className="pointer-events-none relative h-44 w-32 drop-shadow-[0_10px_30px_rgba(124,92,255,0.35)]"
      aria-hidden
    >
      <path
        d="M60 6C32 6 14 24 14 54v62c0 29 20 48 46 48s46-19 46-48V54C106 24 88 6 60 6Z"
        className="fill-white/5 stroke-white/35"
        strokeWidth="2"
      />
      <path
        d="M56 8C34 10 16 26 16 54v18h40V8Z"
        className={cn("transition-colors duration-100", left ? lit : unlit)}
        strokeWidth="2"
      />
      <path
        d="M64 8c22 2 40 18 40 46v18H64V8Z"
        className={cn("transition-colors duration-100", right ? lit : unlit)}
        strokeWidth="2"
      />
      <rect
        x="54"
        y="24"
        width="12"
        height="28"
        rx="6"
        className={cn("transition-colors duration-100", middle ? lit : unlit)}
        strokeWidth="2"
      />
      {wheel && (
        <g
          key={wheel.n}
          className={
            wheel.dir === "up" || wheel.dir === "down"
              ? wheel.dir === "up"
                ? "hf-dt-wheel-up"
                : "hf-dt-wheel-down"
              : ""
          }
        >
          <rect
            x="58"
            y="30"
            width="4"
            height="16"
            rx="2"
            className="fill-[#e9ddff]"
          />
        </g>
      )}
      <rect
        x="6"
        y="84"
        width="9"
        height="16"
        rx="3"
        className={cn("transition-colors duration-100", back ? lit : unlit)}
        strokeWidth="2"
      />
      <rect
        x="6"
        y="104"
        width="9"
        height="16"
        rx="3"
        className={cn("transition-colors duration-100", forward ? lit : unlit)}
        strokeWidth="2"
      />
      <line
        x1="16"
        y1="72"
        x2="104"
        y2="72"
        className="stroke-white/30"
        strokeWidth="2"
      />
    </svg>
  );
}
