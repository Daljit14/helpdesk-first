"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Globe, RefreshCw, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportLine, ToolReport } from "./diagnostics";
import {
  bestClockOffset,
  clockFixSteps,
  clockVerdict,
  describeSkew,
  formatOffset,
  SKEW_BAD_MS,
  SKEW_WARN_MS,
  type ClockOffset,
  type ClockSample,
} from "./dev-logic";
import { Panel, StepList, useEnv, useSaveResult } from "./dev-shared";
import { StatTile, ToolButton, ToolCard, ToolNotice } from "./tool-shell";

type Status = "idle" | "checking" | "done" | "error";

const SAMPLES = 5;
const TIMEOUT_MS = 6000;
const OS_CHOICES = [
  "Windows",
  "macOS",
  "iOS",
  "Android",
  "ChromeOS",
  "Linux",
] as const;

/** One request to the same-origin time endpoint. */
async function takeSample(signal: AbortSignal): Promise<ClockSample> {
  const t0 = Date.now();
  const res = await fetch("/api/network-check/ping", {
    cache: "no-store",
    signal,
  });
  const t1 = Date.now();
  if (!res.ok) throw new Error(`Server answered ${res.status}`);
  let server: number | null = null;
  let coarse = false;
  try {
    const body = (await res.clone().json()) as { serverTime?: unknown };
    if (typeof body.serverTime === "number" && Number.isFinite(body.serverTime))
      server = body.serverTime;
  } catch {
    // fall back to the Date header
  }
  if (server === null) {
    const header = res.headers.get("date");
    const parsed = header ? Date.parse(header) : NaN;
    if (!Number.isFinite(parsed))
      throw new Error("No time in the server response");
    server = parsed;
    coarse = true;
  }
  return { t0, t1, server, coarse };
}

function fmtClock(ms: number, utc: boolean): string {
  try {
    return new Date(ms).toLocaleTimeString("en-GB", {
      hour12: false,
      timeZone: utc ? "UTC" : undefined,
    });
  } catch {
    return "--:--:--";
  }
}

function tzInfo(): { zone: string; offset: string } {
  let zone = "Unknown";
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
  } catch {
    // keep Unknown
  }
  const mins = -new Date().getTimezoneOffset();
  const sign = mins < 0 ? "-" : "+";
  const a = Math.abs(mins);
  return {
    zone,
    offset: `UTC${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`,
  };
}

export function DevClockTool() {
  const env = useEnv();
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ClockOffset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState<{ zone: string; offset: string } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [osPick, setOsPick] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(
      () => controller.abort(),
      TIMEOUT_MS * SAMPLES
    );
    setStatus("checking");
    setError(null);
    const samples: ClockSample[] = [];
    try {
      if (!navigator.onLine) throw new Error("offline");
      for (let i = 0; i < SAMPLES; i++) {
        const per = new AbortController();
        const kill = window.setTimeout(() => per.abort(), TIMEOUT_MS);
        const stop = () => per.abort();
        controller.signal.addEventListener("abort", stop, { once: true });
        try {
          samples.push(await takeSample(per.signal));
        } finally {
          window.clearTimeout(kill);
          controller.signal.removeEventListener("abort", stop);
        }
      }
    } catch (err) {
      if (controller.signal.aborted && abortRef.current !== controller) return; // superseded or unmounted
      if (samples.length === 0) {
        const name = err instanceof Error ? err.name : "";
        setError(
          err instanceof Error && err.message === "offline"
            ? "You appear to be offline, so the clock can't be compared with the server."
            : name === "AbortError"
              ? "The server didn't answer in time. Check your connection and try again."
              : "Couldn't reach the server to compare clocks. Check your connection, VPN or ad-blocker and try again."
        );
        setStatus("error");
        window.clearTimeout(timer);
        return;
      }
    }
    window.clearTimeout(timer);
    if (abortRef.current !== controller) return;
    const best = bestClockOffset(samples);
    if (!best) {
      setError("The server's reply didn't include a usable time.");
      setStatus("error");
      return;
    }
    setResult(best);
    setTz(tzInfo());
    setNow(Date.now());
    setStatus("done");
  }

  useEffect(() => {
    queueMicrotask(() => void run());
    return () => abortRef.current?.abort();
  }, []);

  // Tick the two clocks once a second while results are showing.
  useEffect(() => {
    if (status !== "done") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  const verdict = result
    ? clockVerdict(result.offsetMs, result.uncertaintyMs)
    : null;
  const detectedOs = env?.os ?? "Unknown";
  const stepsOs =
    osPick ??
    (OS_CHOICES.includes(detectedOs as (typeof OS_CHOICES)[number])
      ? detectedOs
      : detectedOs === "iPadOS"
        ? "iOS"
        : detectedOs);

  const lines: ReportLine[] = result
    ? [
        [
          "Clock offset vs server",
          `${formatOffset(result.offsetMs)} (positive = device is behind)`,
        ],
        [
          "Accuracy",
          `± ${result.uncertaintyMs} ms (round trip ${result.rttMs} ms)`,
        ],
        ["Time zone", tz ? `${tz.zone} (${tz.offset})` : "Unknown"],
        [
          "Skew over 2 minutes",
          Math.abs(result.offsetMs) > SKEW_BAD_MS ? "Yes" : "No",
        ],
      ]
    : [];
  const report: ToolReport | null =
    status === "done" && verdict
      ? {
          tool: "Clock & time sync",
          tone: verdict.tone,
          verdict: verdict.verdict,
          tip: verdict.tip,
          lines,
        }
      : null;
  useSaveResult("dev-clock", report);

  // Needle position: map -5min..+5min onto 0..100%
  const needle = result
    ? Math.max(0, Math.min(100, 50 + (result.offsetMs / 300_000) * 50))
    : 50;
  const pct = (ms: number) => 50 + (ms / 300_000) * 50;

  return (
    <ToolCard
      id="dev-clock"
      icon={Clock}
      title="Clock & time sync check"
      description="Compares your device's clock with our server. A wrong clock breaks sign-in codes, MFA and secure websites."
      report={report}
      active={status === "checking"}
      live={
        status === "checking"
          ? "Comparing your clock with the server"
          : status === "done" && verdict
            ? verdict.verdict
            : status === "error" && error
              ? error
              : undefined
      }
      actions={
        <ToolButton
          icon={RefreshCw}
          spinning={status === "checking"}
          onClick={() => void run()}
          disabled={status === "checking"}
        >
          {status === "idle"
            ? "Check my clock"
            : status === "checking"
              ? "Checking..."
              : status === "error"
                ? "Try again"
                : "Check again"}
        </ToolButton>
      }
    >
      {status === "error" && error && (
        <ToolNotice tone="bad" title="Couldn't check the clock">
          {error}
        </ToolNotice>
      )}

      {status === "checking" && (
        <div className="grid gap-3" aria-hidden>
          <p className="text-center text-sm font-semibold text-white/60">
            Asking the server for the time, {SAMPLES} times...
          </p>
        </div>
      )}

      {status === "done" && result && (
        <div className="grid gap-4">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={Clock}
              label="Your clock"
              value={now ? fmtClock(now, false) : "-"}
            />
            <StatTile
              icon={Globe}
              label="Server (UTC)"
              value={now ? fmtClock(now + result.offsetMs, true) : "-"}
              delay={0.04}
            />
            <StatTile
              icon={Timer}
              label="Your clock is"
              value={describeSkew(result.offsetMs)}
              tone={verdict?.tone}
              delay={0.08}
            />
            <StatTile
              label="Time zone"
              value={tz ? tz.zone : "-"}
              delay={0.12}
            />
          </div>

          <div data-testid="skew-gauge">
            <div
              className="relative h-4 overflow-hidden rounded-full bg-[#ff9bb3]/20"
              aria-hidden
            >
              <span
                className="absolute inset-y-0 bg-[#ffd27c]/35"
                style={{
                  left: `${pct(-SKEW_BAD_MS)}%`,
                  right: `${100 - pct(SKEW_BAD_MS)}%`,
                }}
              />
              <span
                className="absolute inset-y-0 bg-[#5ee0a8]/45"
                style={{
                  left: `${pct(-SKEW_WARN_MS)}%`,
                  right: `${100 - pct(SKEW_WARN_MS)}%`,
                }}
              />
              <span
                className={cn(
                  "hf-dt-needle absolute inset-y-0 w-1 -translate-x-1/2 rounded-full",
                  verdict?.level === "bad"
                    ? "bg-[#ff9bb3]"
                    : verdict?.level === "drift"
                      ? "bg-[#ffd27c]"
                      : "bg-[#5ee0a8]"
                )}
                style={{ left: `${needle}%` }}
              />
            </div>
            <div
              className="mt-1.5 flex justify-between text-[11px] font-bold text-white/55"
              aria-hidden
            >
              <span>5 min ahead</span>
              <span>in sync</span>
              <span>5 min behind</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-white/55">
              Accurate to about ± {result.uncertaintyMs} ms (round trip{" "}
              {result.rttMs} ms).
            </p>
          </div>

          {verdict && verdict.level !== "ok" && (
            <Panel title="How to fix it">
              <div
                className="mb-3 flex flex-wrap gap-1.5"
                role="group"
                aria-label="Choose your device type"
              >
                {OS_CHOICES.map((o) => (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={stepsOs === o}
                    onClick={() => setOsPick(o)}
                    className={cn(
                      "min-h-9 rounded-lg border px-3 text-xs font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40",
                      stepsOs === o
                        ? "border-[#c9b8ff]/60 bg-[#7c5cff]/40"
                        : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10"
                    )}
                  >
                    {o}
                    {detectedOs === o ? " (this device)" : ""}
                  </button>
                ))}
              </div>
              <StepList steps={clockFixSteps(stepsOs)} />
            </Panel>
          )}
        </div>
      )}
    </ToolCard>
  );
}
