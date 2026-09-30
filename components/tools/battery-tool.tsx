"use client";

import { useState } from "react";
import { Battery, Play, RefreshCw, Zap } from "lucide-react";
import { batteryReport, getBatteryInfo, type BatteryInfo } from "./diagnostics";
import { cn } from "@/lib/utils";
import { IdleHint, ToolButton, ToolCard, ToolNotice } from "./tool-shell";

export function BatteryTool() {
  const [info, setInfo] = useState<BatteryInfo | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setInfo(await getBatteryInfo());
    setBusy(false);
  }

  const report = info ? batteryReport(info) : null;
  const pct = info?.supported ? Math.round(info.level * 100) : 0;
  const fill =
    pct <= 20
      ? "bg-[linear-gradient(90deg,#e0245e,#ff9bb3)]"
      : pct <= 50
        ? "bg-[linear-gradient(90deg,#e08a00,#ffd27c)]"
        : "bg-[linear-gradient(90deg,#12805c,#5ee0a8)]";

  return (
    <ToolCard
      id="battery"
      icon={Battery}
      title="Battery check"
      description="Shows charge level and whether you're plugged in — low battery can trigger power saving that slows everything down."
      report={report}
      active={busy}
      live={
        busy ? "Checking battery" : info ? "Battery check finished" : undefined
      }
      actions={
        <ToolButton
          icon={busy || info ? RefreshCw : Play}
          spinning={busy}
          onClick={run}
          disabled={busy}
        >
          {busy ? "Checking…" : info ? "Check again" : "Check battery"}
        </ToolButton>
      }
    >
      {info === null ? (
        <IdleHint>Press “Check battery” to read your battery level.</IdleHint>
      ) : !info.supported ? (
        <ToolNotice title="Not supported on this browser">
          Safari and Firefox keep battery details private. Check the battery
          icon in your taskbar or menu bar instead.
        </ToolNotice>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="relative flex items-center" aria-hidden>
            <div className="relative h-20 w-44 rounded-2xl border-[3px] border-white/70 p-1.5">
              <div
                className={cn(
                  "hf-tool-grow h-full rounded-xl",
                  fill,
                  info.charging && "hf-tool-charge"
                )}
                style={{ width: `${Math.max(4, pct)}%` }}
              />
              {info.charging && (
                <Zap className="hf-pop absolute inset-0 m-auto h-9 w-9 fill-white text-white drop-shadow" />
              )}
            </div>
            <div className="ml-1 h-8 w-2 rounded-r-md bg-white/70" />
          </div>
          <div>
            <p className="text-4xl font-extrabold tabular-nums">{pct}%</p>
            <p className="mt-1 text-sm font-semibold text-white/70">
              {info.charging ? "Plugged in · charging" : "On battery"}
            </p>
          </div>
        </div>
      )}
    </ToolCard>
  );
}
