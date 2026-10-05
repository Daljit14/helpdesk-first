"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  Keyboard,
  Lock,
  RefreshCw,
  Stethoscope,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckupReport, useFullCheckup } from "./full-checkup";
import { CATALOG, CATALOG_GROUPS, isCatalogId } from "./tool-catalog";
import { ToolRenderer } from "./tool-renderer";

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function scrollToPanel(id: string) {
  window.setTimeout(() => {
    document.getElementById(id)?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, 60);
}

export function Toolkit() {
  const [open, setOpen] = useState<string | null>(null);
  const checkup = useFullCheckup();
  const reportRef = useRef<HTMLDivElement | null>(null);

  // Deep links like /tools#camera open that tool.
  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (isCatalogId(id)) {
        setOpen(id);
        scrollToPanel(id);
      }
    };
    queueMicrotask(fromHash);
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function toggle(id: string) {
    const next = open === id ? null : id;
    setOpen(next);
    try {
      window.history.replaceState(
        null,
        "",
        next ? `#${next}` : window.location.pathname + window.location.search
      );
    } catch {
      // ignore
    }
    if (next) scrollToPanel(next);
  }

  function runCheckup() {
    void checkup.run();
    window.setTimeout(
      () =>
        reportRef.current?.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "nearest",
        }),
      80
    );
  }

  const runningCheckup = checkup.phase === "running";

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8">
      {/* ---------- Hero ---------- */}
      <header className="hf-rise relative overflow-hidden rounded-[32px] bg-[linear-gradient(120deg,#4b2fb8,#7c5cff_45%,#d946ef)] p-6 text-white shadow-[0_24px_60px_-24px_rgba(91,63,214,0.7)] sm:p-10">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/15 blur-3xl"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#22d3ee]/25 blur-3xl"
        />
        <div className="relative grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_220px]">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] backdrop-blur">
              <Lock className="h-3 w-3" aria-hidden />
              Private by design
            </p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              Toolkit
            </h1>
            <p className="mt-3 max-w-xl text-[17px] text-white/85">
              Quick self-checks for your device and connection — nothing leaves
              your browser.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runCheckup}
                disabled={runningCheckup}
                className="group inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-extrabold text-[#3d2a99] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.5)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50 disabled:cursor-wait disabled:opacity-90"
              >
                {runningCheckup ? (
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Stethoscope className="h-4 w-4" aria-hidden />
                )}
                {runningCheckup
                  ? "Running check-up…"
                  : checkup.phase === "done"
                    ? "Run check-up again"
                    : "Run a full check-up"}
              </button>
              <span className="text-sm font-semibold text-white/80">
                6 automatic checks · about 5 seconds ·{" "}
                {Object.keys(CATALOG).length} tools in all
              </span>
            </div>
          </div>
          <div aria-hidden className="relative hidden h-[180px] md:block">
            <span className="absolute left-2 top-2 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/40 bg-white/20 backdrop-blur-md">
              <Wifi className="h-7 w-7" />
            </span>
            <span className="absolute right-2 top-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/40 bg-white/20 backdrop-blur-md">
              <Camera className="h-7 w-7" />
            </span>
            <span className="absolute bottom-0 left-12 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[#5b3fd6] shadow-[0_12px_30px_-10px_rgba(0,0,0,0.45)]">
              <Keyboard className="relative h-7 w-7" />
            </span>
          </div>
        </div>
      </header>

      <div ref={reportRef} className="scroll-mt-24 empty:hidden">
        {checkup.phase !== "idle" && <CheckupReport state={checkup} />}
      </div>

      {/* ---------- Tool groups ---------- */}
      {CATALOG_GROUPS.map((group, gi) => {
        const openHere = open && group.tools.includes(open) ? open : null;
        return (
          <section
            key={group.id}
            id={`group-${group.id}`}
            aria-labelledby={`group-${group.id}-heading`}
            className="hf-rise"
            style={{ animationDelay: `${0.05 * gi}s` }}
          >
            <h2
              id={`group-${group.id}-heading`}
              className="text-2xl font-extrabold"
            >
              {group.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {group.description}
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.tools.map((id, i) => {
                const meta = CATALOG[id];
                const Icon = meta.icon;
                const expanded = open === id;
                return (
                  <li
                    key={id}
                    className="hf-pop"
                    style={{ animationDelay: `${0.05 * gi + i * 0.06}s` }}
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={expanded ? `tool-panel-${id}` : undefined}
                      onClick={() => toggle(id)}
                      className={cn(
                        "hf-tool-tile group flex h-full w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition-[transform,border-color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
                        expanded
                          ? "border-primary bg-secondary text-secondary-foreground shadow-sm"
                          : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                      )}
                    >
                      <span className="hf-tool-tile-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#7c5cff,#d946ef)] text-white shadow-[0_10px_24px_-12px_#7c5cff]">
                        <Icon className="h-6 w-6" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-extrabold">
                          {meta.label}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {meta.blurb}
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300",
                          expanded && "rotate-180 text-primary"
                        )}
                        aria-hidden
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
            {openHere && (
              <div
                key={openHere}
                id={openHere}
                className="hf-swap mt-4 scroll-mt-24"
              >
                <div id={`tool-panel-${openHere}`}>
                  <ToolRenderer
                    id={openHere}
                    onSpeedTest={() => toggle("speed-test")}
                  />
                </div>
              </div>
            )}
          </section>
        );
      })}

      <p className="flex items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <Lock className="h-4 w-4" aria-hidden />
        These checks run only in your browser. Results are never uploaded — you
        choose what to copy into a ticket.
      </p>
    </div>
  );
}
