"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Play, RefreshCw, Router } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone, ToolReport } from "./diagnostics";
import {
  diagnoseWifi,
  latencyStats,
  median,
  fmtMs,
  type Sample,
  type WifiAnswers,
  type WifiCause,
  type WifiProbe,
} from "./net-sec-logic";
import { SAME_ORIGIN_PING, TRACE_URL, sleep, timedProbe } from "./net-probe";
import { Panel, ProgressBar, SectionLabel } from "./net-sec-ui";
import { ToolButton, ToolCard, ToolNotice } from "./tool-shell";

const PROBES = 8;

type Question<K extends keyof WifiAnswers> = {
  key: K;
  title: string;
  options: { value: WifiAnswers[K]; label: string }[];
};

const QUESTIONS: [
  Question<"scope">,
  Question<"distance">,
  Question<"vpn">,
  Question<"mobile">,
  Question<"sites">,
] = [
  {
    key: "scope",
    title: "Is it every device on this network, or just this one?",
    options: [
      { value: "all", label: "Every device" },
      { value: "one", label: "Just this device" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  {
    key: "distance",
    title: "How close are you to the router?",
    options: [
      { value: "near", label: "Same room" },
      { value: "far", label: "Far / through walls" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  {
    key: "vpn",
    title: "Is a VPN or proxy turned on?",
    options: [
      { value: "on", label: "Yes" },
      { value: "off", label: "No" },
      { value: "unsure", label: "Not sure" },
    ],
  },
  {
    key: "mobile",
    title:
      "Does the internet work on your phone using mobile data (Wi-Fi off)?",
    options: [
      { value: "works", label: "Works fine" },
      { value: "also-bad", label: "Also bad" },
      { value: "cant-test", label: "Can't test" },
    ],
  },
  {
    key: "sites",
    title: "Do all websites fail, or only some?",
    options: [
      { value: "all", label: "Everything is bad" },
      { value: "some", label: "Only some sites" },
    ],
  },
];

const DEFAULTS: WifiAnswers = {
  scope: "unsure",
  distance: "unsure",
  vpn: "unsure",
  mobile: "cant-test",
  sites: "all",
};

const BAR: Record<WifiCause["likelihood"], string> = {
  "Most likely": "bg-[linear-gradient(90deg,#7c5cff,#d946ef)]",
  Possible: "bg-[#ffd27c]",
  Unlikely: "bg-white/25",
};

export function NetWifiTool() {
  const [answers, setAnswers] = useState<WifiAnswers>(DEFAULTS);
  const [phase, setPhase] = useState<"idle" | "probing" | "done">("idle");
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<{
    causes: WifiCause[];
    probe: WifiProbe;
  } | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  async function run() {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setPhase("probing");
    setDone(0);
    setResult(null);
    const samples: Sample[] = [];
    for (let i = 0; i < PROBES && !c.signal.aborted; i++) {
      samples.push(await timedProbe(SAME_ORIGIN_PING, 3000, c.signal));
      setDone(i + 1);
      if (i < PROBES - 1) await sleep(250, c.signal);
    }
    const external = await timedProbe(TRACE_URL, 3000, c.signal);
    if (c.signal.aborted) return;
    const stats = latencyStats(samples);
    const ok = samples.filter((s): s is number => s !== null);
    const probe: WifiProbe = {
      online: stats.received > 0,
      medianMs: median(ok),
      lossPct: stats.lossPct,
      jitterMs: stats.jitter,
      externalOk: external !== null,
    };
    setResult({ probe, causes: diagnoseWifi(answers, probe) });
    setPhase("done");
  }

  const top = result?.causes[0];
  const tone: Tone = !result
    ? "info"
    : top && top.score >= 40
      ? "warn"
      : "info";
  const report: ToolReport | null =
    result && top
      ? {
          tool: "Wi-Fi & router health",
          tone,
          verdict: `Most likely cause: ${top.title}`,
          tip: `${top.why[0]} Start with: ${top.steps[0]}`,
          lines: [
            [
              "Quick test",
              result.probe.online
                ? `${fmtMs(result.probe.medianMs)} median, ${result.probe.lossPct}% loss, jitter ${fmtMs(result.probe.jitterMs)}`
                : "No replies from this site",
            ],
            [
              "Second endpoint",
              result.probe.externalOk ? "reachable" : "unreachable",
            ],
            ...QUESTIONS.map(
              (q) =>
                [
                  q.title,
                  q.options.find((o) => o.value === answers[q.key])?.label ??
                    "—",
                ] as [string, string]
            ),
            ...result.causes
              .slice(0, 3)
              .map(
                (c, i) =>
                  [
                    `Rank ${i + 1}`,
                    `${c.title} (${c.likelihood.toLowerCase()})`,
                  ] as [string, string]
              ),
          ],
        }
      : null;

  return (
    <ToolCard
      id="net-wifi"
      icon={Router}
      title="Wi-Fi & router health check"
      description="Browsers can't see your Wi-Fi settings, so answer five quick questions. We combine them with a short live test to rank the likely cause."
      active={phase === "probing"}
      report={report}
      live={
        phase === "probing"
          ? `Running quick test, ${done} of ${PROBES}`
          : report?.verdict
      }
      actions={
        <ToolButton
          icon={phase === "done" ? RefreshCw : Play}
          disabled={phase === "probing"}
          onClick={run}
        >
          {phase === "probing"
            ? "Testing…"
            : phase === "done"
              ? "Diagnose again"
              : "Diagnose"}
        </ToolButton>
      }
    >
      <div className="grid gap-3">
        {QUESTIONS.map((q, qi) => (
          <fieldset
            key={q.key}
            className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3"
          >
            <legend className="px-1 text-sm font-extrabold">
              <span className="mr-1.5 text-[#c9b8ff]">{qi + 1}.</span>
              {q.title}
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {q.options.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    "inline-flex min-h-10 cursor-pointer items-center rounded-xl border px-3 text-sm font-bold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#c9b8ff]/40",
                    answers[q.key] === o.value
                      ? "border-[#c9b8ff]/60 bg-[#7c5cff]/30 text-white"
                      : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
                  )}
                >
                  <input
                    type="radio"
                    name={`net-wifi-${q.key}`}
                    value={o.value}
                    checked={answers[q.key] === o.value}
                    onChange={() =>
                      setAnswers((a) => ({ ...a, [q.key]: o.value }))
                    }
                    className="sr-only"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {phase === "probing" && (
        <div className="mt-4 grid gap-1.5">
          <p className="text-xs font-bold text-white/65">
            Running quick latency test… {done}/{PROBES}
          </p>
          <ProgressBar value={done / PROBES} label="Quick test progress" />
        </div>
      )}

      {result && (
        <div className="mt-4 grid gap-3">
          {!result.probe.online && (
            <ToolNotice
              tone="bad"
              title="This page couldn't reach the site at all"
            >
              You may be offline right now. Fix the connection first (see the
              guides below), then run this again.
            </ToolNotice>
          )}
          <SectionLabel>Ranked likely causes</SectionLabel>
          {result.causes.map((c, i) => (
            <Panel key={c.id} className="grid gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-extrabold">
                  <span className="mr-2 text-white/50">#{i + 1}</span>
                  {c.title}
                </p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold",
                    c.likelihood === "Most likely"
                      ? "bg-[#7c5cff]/40 text-white"
                      : c.likelihood === "Possible"
                        ? "bg-[#ffd27c]/20 text-[#ffd27c]"
                        : "bg-white/10 text-white/60"
                  )}
                >
                  {c.likelihood}
                </span>
              </div>
              <div
                role="meter"
                aria-label={`${c.title} likelihood`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={c.score}
                className="h-1.5 overflow-hidden rounded-full bg-white/10"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-700",
                    BAR[c.likelihood]
                  )}
                  style={{ width: `${Math.max(4, c.score)}%` }}
                />
              </div>
              {i < 3 && c.likelihood !== "Unlikely" && (
                <>
                  <ul className="grid gap-1 pl-4 text-xs font-semibold text-white/65 [&>li]:list-disc">
                    {c.why.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <ol className="grid gap-1 pl-4 text-sm font-medium text-white/85 [&>li]:list-decimal">
                    {c.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap gap-x-4">
                    {c.guides.map((g) => (
                      <Link
                        key={g.id}
                        href={`/issues/${g.id}`}
                        className="group inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-extrabold text-[#c9b8ff] hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40"
                      >
                        {g.label}
                        <ArrowRight
                          className="h-4 w-4 transition-transform group-hover:translate-x-1"
                          aria-hidden
                        />
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </Panel>
          ))}
        </div>
      )}
    </ToolCard>
  );
}
