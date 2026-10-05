"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Gauge,
  Play,
  RefreshCw,
  Square,
  Timer,
  Waves,
  WifiOff,
} from "lucide-react";
import type { ToolReport } from "./diagnostics";
import {
  fmtMs,
  diagnoseStability,
  latencyStats,
  type Sample,
} from "./net-sec-logic";
import { SAME_ORIGIN_PING, TRACE_URL, sleep, timedProbe } from "./net-probe";
import { LatencyChart, ProgressBar } from "./net-sec-ui";
import {
  IdleHint,
  StatTile,
  ToolButton,
  ToolCard,
  ToolNotice,
} from "./tool-shell";

const ROUNDS = 25;
const INTERVAL_MS = 1000;
const TIMEOUT_MS = 3000;
const MIN_ROUNDS_FOR_VERDICT = 5;

type Phase = "idle" | "running" | "done";

export function NetStabilityTool() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [site, setSite] = useState<Sample[]>([]);
  const [other, setOther] = useState<Sample[]>([]);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  async function start() {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setSite([]);
    setOther([]);
    setPhase("running");
    const a: Sample[] = [];
    const b: Sample[] = [];
    for (let i = 0; i < ROUNDS && !c.signal.aborted; i++) {
      const began = performance.now();
      const [x, y] = await Promise.all([
        timedProbe(SAME_ORIGIN_PING, TIMEOUT_MS, c.signal),
        timedProbe(TRACE_URL, TIMEOUT_MS, c.signal),
      ]);
      if (c.signal.aborted) break;
      a.push(x);
      b.push(y);
      setSite([...a]);
      setOther([...b]);
      const wait = INTERVAL_MS - (performance.now() - began);
      if (i < ROUNDS - 1 && wait > 0) await sleep(wait, c.signal);
    }
    if (ctrl.current === c) setPhase("done");
  }

  function stop() {
    ctrl.current?.abort();
    setPhase("done");
  }

  const running = phase === "running";
  const stats = latencyStats(site);
  const otherStats = latencyStats(other);
  const otherReachable = otherStats.received > 0;
  const enough = site.length >= MIN_ROUNDS_FOR_VERDICT;
  const diag =
    phase === "done" && enough
      ? diagnoseStability(
          site,
          otherReachable || other.length === 0 ? other : null
        )
      : null;

  const report: ToolReport | null = diag
    ? {
        tool: "Connection stability",
        tone: diag.tone,
        verdict: diag.verdict,
        tip: diag.tip,
        lines: [
          [
            "Test length",
            `${site.length} probes over about ${site.length} seconds`,
          ],
          [
            "Average / min / max",
            `${fmtMs(stats.avg)} / ${fmtMs(stats.min)} / ${fmtMs(stats.max)}`,
          ],
          ["Jitter", fmtMs(stats.jitter)],
          ["Packet loss", `${stats.lossPct}%`],
          [
            "Second endpoint (cloudflare.com)",
            otherReachable
              ? `${fmtMs(otherStats.avg)} avg, ${otherStats.lossPct}% loss`
              : "unreachable (blocked or offline)",
          ],
        ],
      }
    : null;

  const lossTone =
    stats.lossPct >= 5 ? "bad" : stats.lossPct >= 1 ? "warn" : "good";
  const jitterTone = (stats.jitter ?? 0) > 40 ? "warn" : "good";

  return (
    <ToolCard
      id="net-stability"
      icon={Waves}
      title="Connection stability test"
      description="Sends a small probe every second for about 25 seconds to see whether your connection is steady enough for video calls. Nothing is uploaded."
      active={running}
      report={report}
      live={
        running
          ? `Testing, ${site.length} of ${ROUNDS} probes done`
          : diag
            ? diag.verdict
            : undefined
      }
      actions={
        running ? (
          <ToolButton variant="danger" icon={Square} onClick={stop}>
            Stop
          </ToolButton>
        ) : (
          <ToolButton
            icon={phase === "done" ? RefreshCw : Play}
            onClick={start}
          >
            {phase === "done" ? "Run again" : "Start test"}
          </ToolButton>
        )
      }
    >
      {phase === "idle" ? (
        <IdleHint>
          Press Start and keep this tab open for about 25 seconds.
        </IdleHint>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-white/65">
              <span className="inline-flex items-center gap-2">
                {running && (
                  <span
                    aria-hidden
                    className="hf-ping h-2 w-2 rounded-full bg-[#5ee0a8]"
                  />
                )}
                {running ? "Testing…" : "Finished"}
              </span>
              <span className="tabular-nums">
                {site.length}/{ROUNDS} probes
              </span>
            </div>
            <ProgressBar value={site.length / ROUNDS} label="Test progress" />
          </div>

          <LatencyChart
            maxPoints={ROUNDS}
            label={`Latency chart. Average ${fmtMs(stats.avg)}, ${stats.lossPct} percent loss.`}
            series={[
              { name: "This site", color: "#b69cff", samples: site },
              { name: "cloudflare.com", color: "#67e8f9", samples: other },
            ]}
          />

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatTile
              icon={Gauge}
              label="Average"
              value={fmtMs(stats.avg)}
              tone={(stats.avg ?? 0) > 200 ? "warn" : undefined}
            />
            <StatTile
              icon={Activity}
              label="Min / max"
              value={`${stats.min === null ? "—" : Math.round(stats.min)} / ${stats.max === null ? "—" : Math.round(stats.max)} ms`}
            />
            <StatTile
              icon={Timer}
              label="Jitter"
              value={fmtMs(stats.jitter)}
              tone={stats.jitter === null ? undefined : jitterTone}
            />
            <StatTile
              icon={WifiOff}
              label="Packet loss"
              value={`${stats.lossPct}%`}
              tone={site.length ? lossTone : undefined}
            />
          </div>

          <p className="text-xs font-semibold text-white/60">
            Numbers above are for this site&apos;s connection.
            {other.length > 0 &&
              (otherReachable
                ? ` cloudflare.com: ${fmtMs(otherStats.avg)} average, ${otherStats.lossPct}% lost.`
                : " cloudflare.com: no replies.")}
          </p>

          {phase === "done" && !enough && (
            <ToolNotice tone="warn" title="Test stopped too early">
              Let it run for at least {MIN_ROUNDS_FOR_VERDICT} seconds to get a
              verdict.
            </ToolNotice>
          )}
          {phase === "done" &&
            enough &&
            other.length > 0 &&
            !otherReachable && (
              <ToolNotice tone="info" title="Comparison endpoint unreachable">
                Your network (or this site&apos;s security policy) blocked the
                second test address, so the verdict uses this site only.
              </ToolNotice>
            )}
        </div>
      )}
    </ToolCard>
  );
}
