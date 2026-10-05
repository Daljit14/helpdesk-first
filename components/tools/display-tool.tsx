"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Gauge, Maximize, Monitor, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  enterFullscreen,
  exitFullscreen,
  fullscreenActive,
  measureRefreshRate,
  refreshReport,
  type ToolReport,
} from "./diagnostics";
import { StatTile, ToolButton, ToolCard } from "./tool-shell";

const COLORS = [
  { name: "Black", bg: "#000000", fg: "#ffffff" },
  { name: "White", bg: "#ffffff", fg: "#000000" },
  { name: "Red", bg: "#ff0000", fg: "#ffffff" },
  { name: "Green", bg: "#00ff00", fg: "#000000" },
  { name: "Blue", bg: "#0000ff", fg: "#ffffff" },
  { name: "Grey", bg: "#808080", fg: "#ffffff" },
];

export function DisplayTool() {
  const [testing, setTesting] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);
  const [pixelDone, setPixelDone] = useState(false);
  const [hz, setHz] = useState<number | null | undefined>(undefined);
  const [measuring, setMeasuring] = useState(false);
  const startWrapRef = useRef<HTMLDivElement | null>(null);

  const testingRef = useRef(false);
  const everFullscreenRef = useRef(false);
  const measureIdRef = useRef(0);

  useEffect(() => {
    testingRef.current = testing;
  }, [testing]);

  // Leaving browser fullscreen (Esc handled by the browser) ends the test.
  // Only reacts after we've actually seen fullscreen turn on, so browsers that
  // refuse it (iOS Safari) keep the in-page overlay instead of closing it.
  useEffect(() => {
    if (!testing) return;
    const onChange = () => {
      if (fullscreenActive()) {
        everFullscreenRef.current = true;
        return;
      }
      if (!everFullscreenRef.current) return;
      everFullscreenRef.current = false;
      setTesting(false);
      setPixelDone(true);
      startWrapRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    // Keys are listened for on the document: entering fullscreen can drop
    // focus from the overlay, which would make Esc / arrows do nothing.
    const onKey = (e: globalThis.KeyboardEvent) => {
      const onButton = !!(e.target as HTMLElement | null)?.closest?.("button");
      if ((e.key === " " || e.key === "Enter") && onButton) return; // let "Exit test" work
      if (e.key === "Escape") {
        e.preventDefault();
        finishTest();
      } else if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setColorIndex((i) => (i + 1) % COLORS.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setColorIndex((i) => (i - 1 + COLORS.length) % COLORS.length);
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // finishTest only touches stable setters/refs
  }, [testing]);

  // Leave fullscreen and stop any measurement if the tool unmounts mid-test
  // (e.g. switching tabs in the guide page).
  useEffect(() => {
    return () => {
      measureIdRef.current++;
      if (testingRef.current) void exitFullscreen();
    };
  }, []);

  function startTest() {
    setColorIndex(0);
    setTesting(true);
    everFullscreenRef.current = false;
    // Must run inside the click handler to count as a user gesture.
    void enterFullscreen().then((ok) => {
      if (ok) everFullscreenRef.current = true;
    });
  }

  function finishTest() {
    everFullscreenRef.current = false;
    setTesting(false);
    setPixelDone(true);
    void exitFullscreen();
    window.setTimeout(
      () => startWrapRef.current?.querySelector("button")?.focus(),
      0
    );
  }

  async function measure() {
    const id = ++measureIdRef.current;
    setMeasuring(true);
    const value = await measureRefreshRate(1200);
    if (id !== measureIdRef.current) return;
    setHz(value);
    setMeasuring(false);
  }

  let report: ToolReport | null = null;
  if (hz !== undefined) {
    report = refreshReport(hz);
    if (pixelDone) report.lines.push(["Colour (dead pixel) test", "Completed"]);
  } else if (pixelDone) {
    report = {
      tool: "Display",
      tone: "info",
      verdict: "Colour test finished.",
      tip: "A dot that stays black on every colour is a dead pixel (a hardware fault). A dot stuck on one colour is a stuck pixel and sometimes recovers. Smudges that move are just dust — wipe the screen gently.",
      lines: [["Colour (dead pixel) test", "Completed"]],
    };
  }

  return (
    <ToolCard
      id="display"
      icon={Monitor}
      title="Display test"
      description="Fill the screen with solid colours to spot dead or stuck pixels, and estimate your screen's refresh rate."
      report={report}
      active={measuring}
      live={
        measuring
          ? "Measuring refresh rate"
          : hz
            ? `Refresh rate about ${hz} hertz`
            : undefined
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div
          ref={startWrapRef}
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
        >
          <div className="flex gap-1.5" aria-hidden>
            {COLORS.map((c, i) => (
              <span
                key={c.name}
                className="hf-pop h-8 flex-1 rounded-lg border border-white/15"
                style={{ background: c.bg, animationDelay: `${i * 0.06}s` }}
              />
            ))}
          </div>
          <p className="text-sm text-white/70">
            Cycles through {COLORS.length} full-screen colours. Click or press →
            for the next one, Esc to exit.
          </p>
          <ToolButton
            icon={Maximize}
            onClick={startTest}
            className="self-start"
          >
            Start colour test
          </ToolButton>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div
            className="relative h-8 overflow-hidden rounded-lg bg-white/5"
            aria-hidden
          >
            <span
              className={cn(
                "absolute top-1 h-6 w-6 rounded-full bg-[linear-gradient(135deg,#9ee7ff,#7c5cff)] shadow-[0_0_14px_#7c5cff]",
                measuring ? "left-1/2" : "left-1"
              )}
            />
          </div>
          {hz !== undefined && !measuring ? (
            <StatTile
              icon={Gauge}
              label="Refresh rate"
              value={hz ? `~${hz} Hz` : "Unknown"}
              tone={hz ? (hz < 50 ? "warn" : "good") : "info"}
            />
          ) : (
            <p className="text-sm text-white/70">
              Counts how many frames your screen draws per second (keep this tab
              in front).
            </p>
          )}
          <ToolButton
            variant="ghost"
            icon={measuring ? RefreshCw : Gauge}
            spinning={measuring}
            onClick={measure}
            disabled={measuring}
            className="self-start"
          >
            {measuring
              ? "Measuring…"
              : hz !== undefined
                ? "Measure again"
                : "Measure refresh rate"}
          </ToolButton>
        </div>
      </div>

      {testing &&
        createPortal(
          <PixelOverlay
            index={colorIndex}
            onNext={() => setColorIndex((i) => (i + 1) % COLORS.length)}
            onExit={finishTest}
          />,
          document.body
        )}
    </ToolCard>
  );
}

function PixelOverlay({
  index,
  onNext,
  onExit,
}: {
  index: number;
  onNext: () => void;
  onExit: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const color = COLORS[index];

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`Dead pixel test: ${color.name} screen. Press the right arrow for the next colour, Escape to exit.`}
      tabIndex={-1}
      onClick={onNext}
      className="fixed inset-0 z-[9999] cursor-pointer outline-none"
      style={{ background: color.bg, color: color.fg }}
    >
      <div
        key={index}
        className="hf-tool-hint pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-extrabold backdrop-blur"
        style={{
          background:
            color.fg === "#ffffff"
              ? "rgb(0 0 0 / 0.45)"
              : "rgb(255 255 255 / 0.6)",
        }}
        aria-live="polite"
      >
        {color.name} · {index + 1}/{COLORS.length} · Click or → for next · Esc
        to exit
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onExit();
        }}
        className="hf-tool-hint absolute right-5 top-5 inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-extrabold focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#7c5cff]"
        style={{
          background:
            color.fg === "#ffffff"
              ? "rgb(0 0 0 / 0.45)"
              : "rgb(255 255 255 / 0.6)",
        }}
      >
        <X className="h-4 w-4" aria-hidden />
        Exit test
      </button>
    </div>
  );
}
