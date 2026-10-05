"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Gauge,
  RefreshCw,
  Timer,
  TriangleAlert,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import {
  measureLatencyOnce,
  measureDownload,
  summarizeLatency,
  type DownloadFailure,
  getConnectionInfo,
  type ConnectionInfo,
  type LatencySample,
} from "@/lib/network-check";
import { cn } from "@/lib/utils";
import { CopyResultsButton } from "@/components/tools/tool-shell";
import type { ToolReport } from "@/components/tools/diagnostics";

type Result = {
  online: boolean;
  latencyMs: number | null;
  jitterMs: number | null;
  downloadMbps: number | null;
  downloadFailure: DownloadFailure | null;
  connection: ConnectionInfo | null;
};

const FAILURE_TEXT: Record<DownloadFailure, string> = {
  timeout:
    "The download test took too long and was stopped — your connection may be very slow or dropping out.",
  "rate-limited":
    "The speed test was run too many times in a row. Wait a minute and try again.",
  failed:
    "The download test couldn't finish. A VPN, firewall or flaky Wi-Fi can interrupt it — try again, or switch networks.",
  aborted: "The test was cancelled.",
};

type Phase = "idle" | "ping" | "download" | "done";

const PING_COUNT = 6;
const GAUGE_MAX = 200; // Mbps shown at the end of the dial

function interpret(result: Result): {
  tone: "good" | "warn" | "bad";
  text: string;
} {
  if (!result.online) {
    return {
      tone: "bad",
      text: "This device could not reach the server at all — that points at your network connection, not this site.",
    };
  }
  if (result.downloadFailure && result.downloadFailure !== "aborted") {
    return { tone: "warn", text: FAILURE_TEXT[result.downloadFailure] };
  }
  if (result.latencyMs !== null && result.latencyMs > 300) {
    return {
      tone: "warn",
      text: "Latency is high. That usually means a weak Wi-Fi signal, a congested network, or VPN overhead.",
    };
  }
  if (result.downloadMbps !== null && result.downloadMbps < 5) {
    return {
      tone: "warn",
      text: "Download speed is low for typical work use (video calls, cloud sync). Try testing on a wired connection.",
    };
  }
  if (result.jitterMs !== null && result.jitterMs > 80) {
    return {
      tone: "warn",
      text: "Latency is inconsistent between requests — a common cause of choppy calls even when the average looks fine.",
    };
  }
  return {
    tone: "good",
    text: "Connection looks healthy from this device right now.",
  };
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Animates a number from its previous value to `target`. */
function useCountUp(target: number | null, duration = 1100) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (target === null) return;
    if (prefersReducedMotion()) {
      from.current = target;
      queueMicrotask(() => setValue(target));
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (target - origin) * eased;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

/** Log-ish scale so 5, 25 and 100 Mbps all get meaningful room on the dial. */
function gaugeFraction(mbps: number) {
  return Math.min(
    1,
    Math.log10(1 + Math.max(0, mbps)) / Math.log10(1 + GAUGE_MAX)
  );
}

function latencyTone(ms: number) {
  if (!Number.isFinite(ms)) return "bad";
  if (ms < 120) return "good";
  if (ms < 300) return "warn";
  return "bad";
}

const TONE_BAR: Record<string, string> = {
  good: "bg-[linear-gradient(180deg,#5ee0a8,#12805c)]",
  warn: "bg-[linear-gradient(180deg,#ffd27c,#e08a00)]",
  bad: "bg-[linear-gradient(180deg,#ff9bb3,#e0245e)]",
};

export function NetworkCheckWidget() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [samples, setSamples] = useState<LatencySample[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const running = phase === "ping" || phase === "download";

  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  // Cancel any in-flight test if the tab/tool is switched away or unmounted.
  useEffect(() => {
    return () => {
      runIdRef.current++;
      abortRef.current?.abort();
    };
  }, []);

  const run = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = ++runIdRef.current;
    const stale = () => runId !== runIdRef.current;

    setResult(null);
    setSamples([]);
    setPhase("ping");
    // The first request pays for DNS + TLS + a possible serverless cold start;
    // it would make latency and jitter look much worse than they are.
    await measureLatencyOnce(5000, controller.signal);
    if (stale()) return;
    const collected: LatencySample[] = [];
    for (let i = 0; i < PING_COUNT; i++) {
      const sample = await measureLatencyOnce(5000, controller.signal);
      if (stale()) return;
      collected.push(sample);
      setSamples([...collected]);
    }
    const { avgMs, jitterMs } = summarizeLatency(collected);
    const online = collected.some((s) => s.ok);
    let downloadMbps: number | null = null;
    let downloadFailure: DownloadFailure | null = null;
    if (online) {
      setPhase("download");
      const dl = await measureDownload({ signal: controller.signal });
      if (stale()) return;
      if (dl.ok) downloadMbps = dl.mbps;
      else downloadFailure = dl.reason;
    }
    setResult({
      online,
      latencyMs: avgMs,
      jitterMs,
      downloadMbps,
      downloadFailure,
      connection: getConnectionInfo(),
    });
    setPhase("done");
  };

  const speed = useCountUp(
    result?.downloadMbps ?? (phase === "done" ? 0 : null)
  );
  const latency = useCountUp(result?.latencyMs ?? null, 900);
  const jitter = useCountUp(result?.jitterMs ?? null, 900);
  const verdict = result ? interpret(result) : null;
  const report: ToolReport | null =
    result && verdict
      ? {
          tool: "Network check",
          tone: verdict.tone === "good" ? "good" : verdict.tone,
          verdict: verdict.text,
          tip: "Measured from this browser to this site, not your whole internet connection.",
          lines: [
            ["Reaches this site", result.online ? "Yes" : "No"],
            [
              "Latency",
              result.latencyMs !== null
                ? `${Math.round(result.latencyMs)} ms`
                : "n/a",
            ],
            [
              "Jitter",
              result.jitterMs !== null
                ? `${Math.round(result.jitterMs)} ms`
                : "n/a",
            ],
            [
              "Download",
              result.downloadMbps !== null
                ? `${result.downloadMbps.toFixed(1)} Mbps`
                : result.downloadFailure
                  ? "Test failed"
                  : "n/a",
            ],
          ],
        }
      : null;
  const failed = !!result && (!result.online || !!result.downloadFailure);

  // Gauge geometry: 270° arc.
  const R = 88;
  const C = 2 * Math.PI * R;
  const ARC = C * 0.75;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const fraction = phase === "done" ? gaugeFraction(speed) : 0;
  const needleDeg = -135 + fraction * 270;

  const steps: Array<{ key: Phase; label: string; icon: typeof Activity }> = [
    { key: "ping", label: "Ping", icon: Activity },
    { key: "download", label: "Download", icon: Zap },
    { key: "done", label: "Result", icon: CheckCircle2 },
  ];
  const PHASE_INDEX: Record<Phase, number> = {
    idle: -1,
    ping: 0,
    download: 1,
    done: 2,
  };
  const phaseIndex = PHASE_INDEX[phase];

  return (
    <section
      aria-labelledby="netcheck-heading"
      className="relative mt-6 overflow-hidden rounded-[28px] bg-[radial-gradient(120%_120%_at_0%_0%,#2d1f63_0%,#16112a_55%,#0d0a1c_100%)] p-6 text-white shadow-[var(--shadow-md)] sm:p-8"
    >
      {/* Ambient grid + glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]"
      />
      <div
        aria-hidden
        className="hf-blob-a pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#7c5cff]/30 blur-3xl"
      />
      <div
        aria-hidden
        className="hf-blob-b pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full bg-[#22d3ee]/20 blur-3xl"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="netcheck-heading"
            className="flex items-center gap-2.5 text-xl font-extrabold"
          >
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
              <Wifi
                className={cn("h-5 w-5 text-[#9ee7ff]", running && "hf-blink")}
                aria-hidden
              />
            </span>
            Network check
          </h2>
          <p className="mt-2 max-w-xl text-sm text-white/70">
            Measures latency, jitter, and download speed from your browser to
            this site — useful before working through a Wi-Fi or VPN guide.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="group relative inline-flex min-h-12 items-center gap-2 overflow-hidden rounded-2xl bg-[linear-gradient(110deg,#7c5cff,#22d3ee,#7c5cff)] bg-[length:200%_100%] px-5 text-sm font-extrabold text-[#0d0a1c] shadow-[0_10px_30px_-10px_#7c5cff] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-90 hf-shimmer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#22d3ee]/40"
        >
          {running ? (
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          ) : result ? (
            <RefreshCw
              className="h-4 w-4 transition-transform group-hover:rotate-180"
              aria-hidden
            />
          ) : (
            <Zap className="h-4 w-4" aria-hidden />
          )}
          {phase === "ping"
            ? "Testing latency…"
            : phase === "download"
              ? "Testing download…"
              : failed
                ? "Retry network check"
                : result
                  ? "Run again"
                  : "Run network check"}
        </button>
      </div>

      {/* Phase stepper */}
      <ol
        className="relative mt-6 flex items-center gap-2"
        aria-label="Test progress"
      >
        {steps.map(({ key, label, icon: Icon }, i) => {
          const done = phaseIndex > i;
          const active = phaseIndex === i && phase !== "done";
          const finished = phase === "done" && i === 2;
          return (
            <li key={key} className="flex flex-1 items-center gap-2">
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-extrabold transition-colors duration-500",
                  done || finished
                    ? "border-[#5ee0a8]/40 bg-[#5ee0a8]/15 text-[#a7f3d0]"
                    : active
                      ? "hf-halo border-[#9ee7ff]/60 bg-[#22d3ee]/15 text-[#cffafe]"
                      : "border-white/10 bg-white/5 text-white/50"
                )}
              >
                <Icon
                  className={cn("h-3.5 w-3.5", active && "hf-float-sm")}
                  aria-hidden
                />
                {label}
              </span>
              {i < steps.length - 1 && (
                <span className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#5ee0a8,#22d3ee)] transition-[width] duration-700",
                      done ? "w-full" : active ? "w-1/2 hf-shimmer" : "w-0"
                    )}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="relative mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ---------- Speed gauge ---------- */}
        <div className="relative mx-auto flex h-[260px] w-[260px] items-center justify-center">
          {running && (
            <>
              <span
                aria-hidden
                className="absolute inset-6 rounded-full border border-[#22d3ee]/40 hf-ping"
              />
              <span
                aria-hidden
                className="absolute inset-6 rounded-full border border-[#7c5cff]/40 hf-ping"
                style={{ animationDelay: "0.9s" }}
              />
            </>
          )}
          <svg
            viewBox="0 0 220 220"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            <defs>
              <linearGradient id="nc-arc" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#22d3ee" />
                <stop offset="0.55" stopColor="#7c5cff" />
                <stop offset="1" stopColor="#f472b6" />
              </linearGradient>
              <filter id="nc-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {/* track */}
            <circle
              cx="110"
              cy="110"
              r={R}
              fill="none"
              stroke="rgb(255 255 255 / 0.08)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${ARC} ${C}`}
              transform="rotate(135 110 110)"
            />
            {/* ticks */}
            {Array.from({ length: 28 }).map((_, i) => {
              const a = ((135 + (i * 270) / 27) * Math.PI) / 180;
              const inner = i % 9 === 0 ? 62 : 68;
              return (
                <line
                  key={i}
                  x1={r(110 + Math.cos(a) * inner)}
                  y1={r(110 + Math.sin(a) * inner)}
                  x2={r(110 + Math.cos(a) * 74)}
                  y2={r(110 + Math.sin(a) * 74)}
                  stroke="rgb(255 255 255 / 0.25)"
                  strokeWidth={i % 9 === 0 ? 2 : 1}
                  strokeLinecap="round"
                />
              );
            })}
            {/* value arc */}
            {phase === "download" ? (
              <g
                className="hf-nc-sweep"
                style={{ transformOrigin: "110px 110px" }}
              >
                <circle
                  cx="110"
                  cy="110"
                  r={R}
                  fill="none"
                  stroke="url(#nc-arc)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={`${ARC * 0.3} ${C}`}
                  transform="rotate(135 110 110)"
                  filter="url(#nc-glow)"
                />
              </g>
            ) : (
              <circle
                cx="110"
                cy="110"
                r={R}
                fill="none"
                stroke="url(#nc-arc)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${ARC * fraction} ${C}`}
                transform="rotate(135 110 110)"
                filter="url(#nc-glow)"
              />
            )}
            {/* needle */}
            <g
              style={{
                transform: `rotate(${phase === "download" ? 0 : needleDeg}deg)`,
                transformOrigin: "110px 110px",
                transition: "transform 1.1s cubic-bezier(.2,.8,.2,1)",
              }}
              className={cn(phase === "download" && "hf-nc-needle")}
            >
              <path
                d="M110 110 L106 104 L110 34 L114 104 Z"
                fill="#ffffff"
                opacity="0.95"
              />
            </g>
            <circle
              cx="110"
              cy="110"
              r="9"
              fill="#16112a"
              stroke="#ffffff"
              strokeWidth="3"
            />
          </svg>
          <div className="relative mt-24 text-center">
            <p className="text-4xl font-extrabold tabular-nums tracking-tight">
              {phase === "done" && result?.downloadMbps !== null && result
                ? speed.toFixed(1)
                : phase === "download"
                  ? "···"
                  : "—"}
            </p>
            <p className="text-xs font-bold uppercase tracking-wider text-white/60">
              {phase === "ping"
                ? "Pinging…"
                : phase === "download"
                  ? "Downloading…"
                  : "Mbps"}
            </p>
          </div>
        </div>

        {/* ---------- Metrics ---------- */}
        <div className="grid content-start gap-4">
          <div className="grid grid-cols-3 gap-3">
            <Metric
              icon={result && !result.online ? WifiOff : CheckCircle2}
              label="Status"
              value={
                result
                  ? result.online
                    ? "Online"
                    : "Unreachable"
                  : running
                    ? "Testing"
                    : "—"
              }
              tone={result ? (result.online ? "good" : "bad") : "idle"}
            />
            <Metric
              icon={Timer}
              label="Latency"
              value={
                result?.latencyMs != null ? `${Math.round(latency)} ms` : "—"
              }
              tone={
                result?.latencyMs != null
                  ? latencyTone(result.latencyMs)
                  : "idle"
              }
            />
            <Metric
              icon={Gauge}
              label="Jitter"
              value={
                result?.jitterMs != null ? `${Math.round(jitter)} ms` : "—"
              }
              tone={
                result?.jitterMs != null
                  ? result.jitterMs > 80
                    ? "warn"
                    : "good"
                  : "idle"
              }
            />
          </div>

          {/* Live ping bars */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between text-xs font-bold text-white/60">
              <span>Ping samples</span>
              <span className="tabular-nums">
                {samples.length}/{PING_COUNT}
              </span>
            </div>
            <div className="mt-3 flex h-20 items-end gap-2" aria-hidden>
              {Array.from({ length: PING_COUNT }).map((_, i) => {
                const s = samples[i];
                const ms = s?.ok ? s.ms : s ? 400 : 0;
                const h = s ? Math.max(12, Math.min(100, (ms / 400) * 100)) : 8;
                const tone = s ? (s.ok ? latencyTone(s.ms) : "bad") : null;
                return (
                  <div
                    key={i}
                    className="flex flex-1 flex-col items-center gap-1.5"
                  >
                    <div className="flex h-full w-full items-end">
                      <div
                        className={cn(
                          "w-full rounded-lg transition-[height] duration-500 ease-out",
                          tone ? TONE_BAR[tone] : "bg-white/10",
                          !s &&
                            phase === "ping" &&
                            samples.length === i &&
                            "hf-blink"
                        )}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold tabular-nums text-white/55">
                      {s ? (s.ok ? `${Math.round(s.ms)}` : "✕") : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <span className="sr-only" aria-live="polite">
              {phase === "ping"
                ? `Ping sample ${samples.length} of ${PING_COUNT}`
                : phase === "download"
                  ? "Measuring download speed"
                  : phase === "done"
                    ? "Network check finished"
                    : ""}
            </span>
          </div>

          {result?.connection && (
            <p className="flex flex-wrap gap-2 text-xs font-semibold text-white/70">
              <span className="rounded-full bg-white/10 px-2.5 py-1">
                {result.connection.effectiveType ?? "unknown"} network
              </span>
              {result.connection.downlinkMbps !== null && (
                <span className="rounded-full bg-white/10 px-2.5 py-1">
                  ~{result.connection.downlinkMbps} Mbps reported
                </span>
              )}
              {result.connection.rttMs !== null && (
                <span className="rounded-full bg-white/10 px-2.5 py-1">
                  {result.connection.rttMs} ms RTT
                </span>
              )}
              {result.connection.saveData && (
                <span className="rounded-full bg-white/10 px-2.5 py-1">
                  Data saver on
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {verdict && (
        <div
          role="status"
          className={cn(
            "hf-rise relative mt-6 flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold",
            verdict.tone === "good" &&
              "border-[#5ee0a8]/30 bg-[#5ee0a8]/10 text-[#d1fae5]",
            verdict.tone === "warn" &&
              "border-[#ffd27c]/30 bg-[#ffd27c]/10 text-[#fef3c7]",
            verdict.tone === "bad" &&
              "border-[#ff9bb3]/30 bg-[#ff9bb3]/10 text-[#ffe4ea]"
          )}
        >
          {verdict.tone === "good" ? (
            <CheckCircle2
              className="hf-pop mt-0.5 h-5 w-5 shrink-0 text-[#5ee0a8]"
              aria-hidden
            />
          ) : (
            <TriangleAlert
              className="hf-pop mt-0.5 h-5 w-5 shrink-0"
              aria-hidden
            />
          )}
          <div className="min-w-0 flex-1">
            <p>{verdict.text}</p>
            {report && (
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <CopyResultsButton reports={[report]} />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "idle" | string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-bold text-white/60">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-lg font-extrabold tabular-nums",
          tone === "good" && "text-[#5ee0a8]",
          tone === "warn" && "text-[#ffd27c]",
          tone === "bad" && "text-[#ff9bb3]",
          tone === "idle" && "text-white/80"
        )}
      >
        {value}
      </p>
    </div>
  );
}
