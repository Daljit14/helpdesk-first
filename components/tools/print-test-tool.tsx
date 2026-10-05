"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, Check, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportLine, ToolReport } from "./diagnostics";
import { PRINT_SYMPTOMS, type PrintSymptom } from "./dev-logic";
import { Panel, StepList, useSaveResult } from "./dev-shared";
import { PrintSheet } from "./print-sheet";
import { ToolButton, ToolCard, ToolNotice } from "./tool-shell";

function formatStamp(): string {
  try {
    return `Printed ${new Date().toLocaleString()}`;
  } catch {
    return "Printed";
  }
}

/** Scales the fixed-size paper sheet down to whatever width the card has. */
function ScaledSheet({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ scale: number; height: number | null }>({
    scale: 1,
    height: null,
  });

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || typeof ResizeObserver === "undefined") return;
    const calc = () => {
      const w = i.offsetWidth || 1;
      const s = Math.min(1, o.clientWidth / w);
      setDims({ scale: s, height: i.offsetHeight * s });
    };
    const ro = new ResizeObserver(calc);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={outer}
      className="overflow-hidden rounded-xl bg-white shadow-[0_10px_40px_-18px_rgba(0,0,0,0.7)]"
      style={dims.height ? { height: dims.height } : undefined}
    >
      <div
        ref={inner}
        style={{
          width: "fit-content",
          transform: `scale(${dims.scale})`,
          transformOrigin: "top left",
        }}
      >
        <div style={{ padding: "6mm" }}>{children}</div>
      </div>
    </div>
  );
}

export function PrintTestTool() {
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState(false);
  const [printError, setPrintError] = useState(false);
  const [stamp, setStamp] = useState("");
  const [symptom, setSymptom] = useState<PrintSymptom["id"] | "perfect" | null>(
    null
  );

  useEffect(() => {
    if (!printing) return;
    document.body.classList.add("hf-dt-printing");
    let cancelled = false;
    let fallback = 0;
    const finish = () => {
      document.body.classList.remove("hf-dt-printing");
      setPrinting(false);
    };
    window.addEventListener("afterprint", finish);
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        try {
          window.print();
          setPrinted(true);
          fallback = window.setTimeout(finish, 4000);
        } catch {
          setPrintError(true);
          finish();
        }
      })
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
      window.removeEventListener("afterprint", finish);
      document.body.classList.remove("hf-dt-printing");
    };
  }, [printing]);

  function startPrint() {
    setPrintError(false);
    if (typeof window.print !== "function") {
      setPrintError(true);
      return;
    }
    setStamp(formatStamp());
    setPrinting(true);
  }

  const selected = PRINT_SYMPTOMS.find((s) => s.id === symptom) ?? null;

  const lines: ReportLine[] = [
    ["Test page sent to printer", printed ? "Yes" : "No"],
    [
      "What the printout looked like",
      symptom === "perfect"
        ? "Everything looked right"
        : (selected?.label ?? "Not reported yet"),
    ],
  ];
  let report: ToolReport | null = null;
  if (symptom === "perfect") {
    report = {
      tool: "Printer test page",
      tone: "good",
      verdict: "The printer produced a clean test page.",
      tip: "If one particular document still prints badly, the problem is in that file or app. Try printing it as a PDF from another program.",
      lines,
    };
  } else if (selected) {
    report = {
      tool: "Printer test page",
      tone: "warn",
      verdict: `Printed test page problem: ${selected.label.toLowerCase()}.`,
      tip: selected.steps[0],
      lines,
    };
  }
  useSaveResult("print-test", report);

  return (
    <ToolCard
      id="print-test"
      icon={Printer}
      title="Printer test page"
      description="Prints a one-page check of alignment, colour, grey tones, text and nozzles. Only the test page is printed, not this website."
      report={report}
      active={printing}
      live={
        printing
          ? "Opening the print dialog"
          : printError
            ? "Printing isn't available here"
            : undefined
      }
      actions={
        <ToolButton icon={Printer} onClick={startPrint} disabled={printing}>
          {printed ? "Print it again" : "Print test page"}
        </ToolButton>
      }
    >
      {printError && (
        <div className="mb-4">
          <ToolNotice tone="bad" title="Couldn't open the print dialog">
            This browser or window blocked printing. Open the page in a normal
            browser tab (not an in-app browser), then try again. Or press Ctrl+P
            / Cmd+P after clicking the button.
          </ToolNotice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/55">
            Print preview (A4 / Letter)
          </p>
          <div data-testid="print-preview">
            <ScaledSheet>
              <PrintSheet stamp={stamp || "Date is added when printed"} />
            </ScaledSheet>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-3">
          <Panel title="1 · Print it">
            <StepList
              steps={[
                "Load plain white paper and press Print test page.",
                "In the print dialog choose the printer you're checking, 100% scale (no 'fit to page') and colour.",
                "Compare the paper with the preview, then tell us what you see below.",
              ]}
            />
          </Panel>

          <Panel title="2 · What did the printout look like?">
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="What the printout looked like"
            >
              <Chip
                pressed={symptom === "perfect"}
                onClick={() => setSymptom("perfect")}
                good
              >
                Looks right
              </Chip>
              {PRINT_SYMPTOMS.map((s) => (
                <Chip
                  key={s.id}
                  pressed={symptom === s.id}
                  onClick={() => setSymptom(s.id)}
                >
                  {s.label}
                </Chip>
              ))}
            </div>

            {selected && (
              <div className="hf-rise mt-4 grid gap-3" key={selected.id}>
                <StepList steps={selected.steps} />
                <div className="flex flex-wrap gap-2">
                  {selected.guides.map((g) => (
                    <Link
                      key={g.id}
                      href={`/issues/${g.id}/guide`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-extrabold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40"
                    >
                      Guide: {g.label}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {symptom === "perfect" && (
              <p className="hf-rise mt-3 flex items-center gap-2 text-sm font-bold text-[#5ee0a8]">
                <Check className="h-4 w-4" aria-hidden /> Great. The printer
                hardware is fine.
              </p>
            )}
          </Panel>
        </div>
      </div>

      {printing &&
        createPortal(
          <div className="hf-dt-print-root" aria-hidden>
            <PrintSheet stamp={stamp} />
          </div>,
          document.body
        )}
    </ToolCard>
  );
}

function Chip({
  pressed,
  onClick,
  good,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  good?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-xl border px-3 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40",
        pressed
          ? good
            ? "border-[#5ee0a8]/60 bg-[#5ee0a8]/25 text-[#d1fae5]"
            : "border-[#c9b8ff]/60 bg-[#7c5cff]/40 text-white"
          : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
      )}
    >
      {children}
    </button>
  );
}
