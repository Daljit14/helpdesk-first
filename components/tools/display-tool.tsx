"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Gauge, Maximize, Monitor, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
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

  // Leaving browser fullscreen (Esc handled by the browser) ends the test.
  useEffect(() => {
    if (!testing) return;
    const onChange = () => {
      if (document.fullscreenElement) return;
      setTesting(false);
      setPixelDone(true);
      startWrapRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [testing]);

  function startTest() {
    setColorIndex(0);
    setTesting(true);
    const root = document.documentElement;
    if (root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen().catch(() => undefined);
    }
  }

  function finishTest() {
    setTesting(false);
    setPixelDone(true);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => undefined);
    }
    window.setTimeout(
      () => startWrapRef.current?.querySelector("button")?.focus(),
      0
    );
  }

  async function measure() {
    setMeasuring(true);
    setHz(await measureRefreshRate(1200));
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
                measuring ? "hf-tool-slide" : "left-1"
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
            onPrev={() =>
              setColorIndex((i) => (i - 1 + COLORS.length) % COLORS.length)
            }
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
  onPrev,
  onExit,
}: {
  index: number;
  onNext: () => void;
  onPrev: () => void;
  onExit: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const color = COLORS[index];

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onExit();
    } else if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onPrev();
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`Dead pixel test: ${color.name} screen. Press the right arrow for the next colour, Escape to exit.`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
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
