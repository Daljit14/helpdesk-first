"use client";

import { useRef, useState } from "react";
import {
  Battery,
  CheckCircle2,
  HardDrive,
  Laptop,
  Monitor,
  Shield,
  Stethoscope,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  batteryReport,
  collectDeviceInfo,
  connectionReport,
  deviceReport,
  getBatteryInfo,
  getPermissionInfo,
  getStorageInfo,
  measureRefreshRate,
  permissionsReport,
  readConnection,
  refreshReport,
  storageReport,
  withTimeout,
  type ToolReport,
} from "./diagnostics";
import { CopyResultsButton, ToneIcon, TONE_TEXT } from "./tool-shell";

type Step = {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => Promise<ToolReport>;
};

/** Only checks that need no permission prompt or user input. */
const STEPS: Step[] = [
  {
    id: "device",
    label: "Device & browser",
    icon: Laptop,
    run: async () => deviceReport(collectDeviceInfo()),
  },
  {
    id: "connection",
    label: "Connection",
    icon: Wifi,
    run: async () => {
      const c = readConnection();
      return connectionReport(c.online, c.info);
    },
  },
  {
    id: "storage",
    label: "Storage",
    icon: HardDrive,
    run: async () => storageReport(await getStorageInfo()),
  },
  {
    id: "battery",
    label: "Battery",
    icon: Battery,
    run: async () => batteryReport(await getBatteryInfo()),
  },
  {
    id: "permissions",
    label: "Permissions",
    icon: Shield,
    run: async () => permissionsReport(await getPermissionInfo()),
  },
  {
    id: "display",
    label: "Display",
    icon: Monitor,
    run: async () => refreshReport(await measureRefreshRate(800)),
  },
];

export type CheckupState = {
  phase: "idle" | "running" | "done";
  current: number;
  reports: ToolReport[];
};

function wait(ms: number) {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return new Promise((r) => setTimeout(r, reduce ? 0 : ms));
}

export function useFullCheckup() {
  const [state, setState] = useState<CheckupState>({
    phase: "idle",
    current: -1,
    reports: [],
  });
  const running = useRef(false);

  async function run() {
    if (running.current) return;
    running.current = true;
    const reports: ToolReport[] = [];
    setState({ phase: "running", current: 0, reports: [] });
    try {
      for (let i = 0; i < STEPS.length; i++) {
        setState({ phase: "running", current: i, reports: [...reports] });
        const fallback: ToolReport = {
          tool: STEPS[i].label,
          tone: "info",
          verdict: "Couldn't run this check.",
          tip: "Your browser blocked it, doesn't support it, or it took too long — that's okay.",
          lines: [],
        };
        // One stuck browser API must never freeze the whole check-up.
        const [report] = await Promise.all([
          withTimeout(
            Promise.resolve().then(() => STEPS[i].run()),
            8000,
            fallback
          ),
          wait(420),
        ]);
        reports.push(report);
      }
      setState({ phase: "done", current: STEPS.length, reports });
    } finally {
      running.current = false;
    }
  }

  return { ...state, run };
}

export function CheckupReport({ state }: { state: CheckupState }) {
  if (state.phase === "idle") return null;
  const done = state.phase === "done";
  const attention = state.reports.filter(
    (r) => r.tone === "warn" || r.tone === "bad"
  ).length;
  const progress = Math.round((state.reports.length / STEPS.length) * 100);

  return (
    <section
      aria-labelledby="checkup-heading"
      className="hf-rise relative overflow-hidden rounded-[28px] bg-[radial-gradient(120%_120%_at_0%_0%,#2d1f63_0%,#16112a_55%,#0d0a1c_100%)] p-5 text-white shadow-[var(--shadow-md)] sm:p-7"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-[#d946ef]/20 blur-3xl"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2
            id="checkup-heading"
            className="flex items-center gap-2.5 text-xl font-extrabold"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
              <Stethoscope className="h-5 w-5 text-[#c9b8ff]" aria-hidden />
            </span>
            {done ? "Check-up report" : "Running check-up…"}
          </h2>
          <p className="mt-2 text-sm text-white/70" aria-live="polite">
            {done
              ? attention === 0
                ? `All ${STEPS.length} checks look fine.`
                : `${attention} of ${STEPS.length} checks need a look.`
              : `Checking ${STEPS[state.current]?.label ?? ""} (${Math.min(state.current + 1, STEPS.length)} of ${STEPS.length})`}
          </p>
        </div>
        {done && (
          <CopyResultsButton reports={state.reports} label="Copy full report" />
        )}
      </div>

      <div
        className="relative mt-5 h-2 overflow-hidden rounded-full bg-white/10"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#7c5cff,#d946ef)] transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <ol className="relative mt-5 grid gap-2.5">
        {STEPS.map((step, i) => {
          const report = state.reports[i];
          const active =
            !report && state.phase === "running" && state.current === i;
          const Icon = step.icon;
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-3.5 transition-colors duration-300",
                report
                  ? "border-white/10 bg-white/5"
                  : active
                    ? "border-[#c9b8ff]/50 bg-[#7c5cff]/15"
                    : "border-white/5 bg-white/[0.02] opacity-60"
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
                {report ? (
                  <ToneIcon tone={report.tone} className="hf-pop h-5 w-5" />
                ) : (
                  <Icon className={cn("h-4 w-4 text-white/70")} aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold">{step.label}</p>
                <p
                  className={cn(
                    "mt-0.5 text-sm font-semibold",
                    report ? TONE_TEXT[report.tone] : "text-white/55"
                  )}
                >
                  {report ? report.verdict : active ? "Checking…" : "Waiting"}
                </p>
                {report && report.tone !== "good" && (
                  <p className="mt-1 text-xs text-white/65">{report.tip}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {done && (
        <p className="relative mt-4 flex items-center gap-2 text-xs font-semibold text-white/60">
          <CheckCircle2 className="h-4 w-4 text-[#5ee0a8]" aria-hidden />
          Camera, microphone, speaker and keyboard tests need you — open them
          below.
        </p>
      )}
    </section>
  );
}
