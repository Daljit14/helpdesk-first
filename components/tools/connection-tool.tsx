"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Gauge,
  Play,
  RefreshCw,
  Timer,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { measureLatencyOnce, type ConnectionInfo } from "@/lib/network-check";
import { connectionReport, readConnection } from "./diagnostics";
import { StatTile, ToolButton, ToolCard, ToolNotice } from "./tool-shell";

const speedLinkClass =
  "group inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-extrabold text-[#c9b8ff] hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#c9b8ff]/40";

export function ConnectionTool({
  speedTestHref = "/tools#speed-test",
  onSpeedTest,
}: {
  /** Where the "full speed test" link points. */
  speedTestHref?: string;
  /** When set (e.g. inside tabs), shows a button that calls this instead of a link. */
  onSpeedTest?: () => void;
}) {
  const [data, setData] = useState<{
    online: boolean;
    info: ConnectionInfo | null;
  } | null>(null);
  const [runKey, setRunKey] = useState(0);
  // undefined = not measured yet, null = couldn't reach this site, number = ms
  const [reach, setReach] = useState<number | null | undefined>(undefined);
  const [probing, setProbing] = useState(false);
  const probeId = useRef(0);

  useEffect(() => {
    const ref = probeId;
    return () => {
      ref.current++;
    };
  }, []);

  // Once checked, keep the online/offline status live.
  useEffect(() => {
    if (!data) return;
    const update = () => setData(readConnection());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [data]);

  async function run() {
    const id = ++probeId.current;
    setData(readConnection());
    setRunKey((k) => k + 1);
    setReach(undefined);
    setProbing(true);
    // navigator.onLine only says a network adapter is up. A real round trip
    // to this site catches "Wi-Fi connected, no internet".
    const sample = await measureLatencyOnce(6000);
    if (id !== probeId.current) return;
    setReach(sample.ok ? sample.ms : null);
    setProbing(false);
  }

  const report = data ? connectionReport(data.online, data.info, reach) : null;

  return (
    <ToolCard
      id="connection"
      icon={Wifi}
      title="Connection info"
      description="What your browser knows about your network right now — instant, no data used."
      report={report}
      live={
        data ? (data.online ? "You are online" : "You are offline") : undefined
      }
      actions={
        <ToolButton
          icon={data ? RefreshCw : Play}
          spinning={probing}
          onClick={run}
          disabled={probing}
        >
          {probing ? "Checking…" : data ? "Check again" : "Check connection"}
        </ToolButton>
      }
    >
      {data ? (
        <div key={runKey} className="grid gap-3">
          <div className="hf-rise flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <span
              className={cn(
                "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                data.online
                  ? "bg-[#5ee0a8]/20 text-[#5ee0a8]"
                  : "bg-[#ff9bb3]/20 text-[#ff9bb3]"
              )}
            >
              {data.online && (
                <span
                  aria-hidden
                  className="hf-ping absolute inset-0 rounded-2xl bg-[#5ee0a8]/25"
                />
              )}
              {data.online ? (
                <Wifi className="relative h-6 w-6" aria-hidden />
              ) : (
                <WifiOff className="relative h-6 w-6" aria-hidden />
              )}
            </span>
            <div>
              <p className="text-xl font-extrabold">
                {data.online ? "Online" : "Offline"}
              </p>
              <p className="text-sm font-semibold text-white/65">
                {data.info?.effectiveType
                  ? `Behaves like a ${data.info.effectiveType.toUpperCase()} connection`
                  : "Network type not shared by this browser"}
              </p>
            </div>
          </div>
          <div className="hf-rise flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            <span className="font-bold text-white/70">Can reach this site</span>
            <span
              className={cn(
                "font-extrabold tabular-nums",
                reach === undefined
                  ? "text-white/60"
                  : reach === null
                    ? "text-[#ff9bb3]"
                    : "text-[#5ee0a8]"
              )}
            >
              {reach === undefined
                ? "Checking…"
                : reach === null
                  ? "No — timed out"
                  : `Yes · ${Math.round(reach)} ms`}
            </span>
          </div>
          {data.info ? (
            <div className="grid grid-cols-3 gap-2.5">
              <StatTile
                icon={Activity}
                label="Type"
                value={data.info.effectiveType ?? "—"}
                delay={0.05}
              />
              <StatTile
                icon={Gauge}
                label="Speed est."
                value={
                  data.info.downlinkMbps !== null
                    ? `~${data.info.downlinkMbps} Mbps`
                    : "—"
                }
                delay={0.1}
              />
              <StatTile
                icon={Timer}
                label="Round trip"
                value={data.info.rttMs !== null ? `${data.info.rttMs} ms` : "—"}
                tone={
                  data.info.rttMs !== null
                    ? data.info.rttMs > 300
                      ? "warn"
                      : "good"
                    : undefined
                }
                delay={0.15}
              />
            </div>
          ) : (
            <ToolNotice title="Details not available here">
              Safari and Firefox keep network details private. The full speed
              test still works everywhere.
            </ToolNotice>
          )}
        </div>
      ) : null}
      {onSpeedTest ? (
        <button
          type="button"
          onClick={onSpeedTest}
          className={cn(speedLinkClass, data && "mt-4")}
        >
          Run the full speed test
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            aria-hidden
          />
        </button>
      ) : (
        <Link
          href={speedTestHref}
          className={cn(speedLinkClass, data && "mt-4")}
        >
          Run the full speed test
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            aria-hidden
          />
        </Link>
      )}
    </ToolCard>
  );
}
