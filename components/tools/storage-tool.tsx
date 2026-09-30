"use client";

import { useState } from "react";
import { HardDrive, Play, RefreshCw } from "lucide-react";
import {
  formatBytes,
  getStorageInfo,
  storageReport,
  type StorageInfo,
} from "./diagnostics";
import {
  IdleHint,
  StatTile,
  ToolButton,
  ToolCard,
  ToolNotice,
} from "./tool-shell";

export function StorageTool() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const next = await getStorageInfo();
    setInfo(next);
    setBusy(false);
  }

  const report = info ? storageReport(info) : null;
  const quotaGb = info?.supported ? info.quota / 1024 ** 3 : 0;
  // Gauge shows how "roomy" the browser quota is (log scale up to ~500 GB).
  const roomFraction = info?.supported
    ? Math.min(1, Math.log10(1 + quotaGb) / Math.log10(501))
    : 0;
  const tone = report?.tone ?? "info";
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <ToolCard
      id="storage"
      icon={HardDrive}
      title="Storage check"
      description="Estimates how much space your browser can use — a quick hint about whether your disk is nearly full."
      report={report}
      active={busy}
      live={
        busy ? "Checking storage" : info ? "Storage check finished" : undefined
      }
      actions={
        <ToolButton
          icon={busy || info ? RefreshCw : Play}
          spinning={busy}
          onClick={run}
          disabled={busy}
        >
          {busy ? "Checking…" : info ? "Check again" : "Check storage"}
        </ToolButton>
      }
    >
      {info === null ? (
        <IdleHint>Press “Check storage” to estimate available space.</IdleHint>
      ) : !info.supported ? (
        <ToolNotice title="Not supported on this browser">
          Your browser doesn&apos;t share storage estimates. Use your
          system&apos;s storage settings instead.
        </ToolNotice>
      ) : (
        <div className="grid items-center gap-5 sm:grid-cols-[150px_minmax(0,1fr)]">
          <div className="relative mx-auto h-[140px] w-[140px]">
            <svg
              viewBox="0 0 120 120"
              className="h-full w-full -rotate-90"
              aria-hidden
            >
              <defs>
                <linearGradient
                  id="hf-tool-storage-arc"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop
                    offset="0"
                    stopColor={tone === "warn" ? "#ffd27c" : "#22d3ee"}
                  />
                  <stop
                    offset="1"
                    stopColor={tone === "warn" ? "#e0245e" : "#7c5cff"}
                  />
                </linearGradient>
              </defs>
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke="rgb(255 255 255 / 0.08)"
                strokeWidth="12"
              />
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke="url(#hf-tool-storage-arc)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${C * roomFraction} ${C}`}
                className="hf-tool-arc"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-extrabold tabular-nums">
                {formatBytes(info.quota)}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                available
              </span>
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <StatTile
              label="Available to browser"
              value={formatBytes(info.quota)}
              tone={tone === "warn" ? "warn" : "good"}
              delay={0.05}
            />
            <StatTile
              label="Used by this site"
              value={formatBytes(info.usage)}
              delay={0.1}
            />
            <div className="sm:col-span-2">
              <div className="flex justify-between text-[11px] font-bold uppercase tracking-wide text-white/55">
                <span>Tight</span>
                <span>Roomy</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="hf-tool-grow h-full rounded-full bg-[linear-gradient(90deg,#ff9bb3,#ffd27c,#5ee0a8)]"
                  style={{ width: `${Math.max(4, roomFraction * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </ToolCard>
  );
}
