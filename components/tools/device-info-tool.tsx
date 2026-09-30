"use client";

import { useState } from "react";
import {
  Clock,
  Cookie,
  Cpu,
  Globe,
  Laptop,
  MemoryStick,
  Monitor,
  Moon,
  Pointer,
  RefreshCw,
  Smartphone,
  Wifi,
  Maximize,
  Play,
} from "lucide-react";
import {
  collectDeviceInfo,
  deviceReport,
  type DeviceInfo,
} from "./diagnostics";
import { IdleHint, StatTile, ToolButton, ToolCard } from "./tool-shell";

export function DeviceInfoTool() {
  const [info, setInfo] = useState<DeviceInfo | null>(null);
  const [runKey, setRunKey] = useState(0);

  function run() {
    setInfo(collectDeviceInfo());
    setRunKey((k) => k + 1);
  }

  const report = info ? deviceReport(info) : null;

  return (
    <ToolCard
      id="device"
      icon={Laptop}
      title="Device & browser info"
      description="Shows the system, browser and screen details support usually asks for — read straight from your browser."
      report={report}
      live={info ? "Device details collected" : undefined}
      actions={
        <ToolButton icon={info ? RefreshCw : Play} onClick={run}>
          {info ? "Check again" : "Show my device info"}
        </ToolButton>
      }
    >
      {info ? (
        <div key={runKey} className="grid gap-4">
          <div className="hf-rise flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <span className="hf-tool-orbit relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#7c5cff,#d946ef)]">
              {info.mobile ? (
                <Smartphone className="h-7 w-7" aria-hidden />
              ) : (
                <Laptop className="h-7 w-7" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-xl font-extrabold">{info.os}</p>
              <p className="text-sm font-semibold text-white/70">
                {info.browser}
                {info.browserVersion ? ` ${info.browserVersion}` : ""} ·{" "}
                {info.mobile ? "Phone / tablet" : "Computer"}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile
              icon={Monitor}
              label="Screen"
              value={`${info.screen} @${info.pixelRatio}x`}
              delay={0.05}
            />
            <StatTile
              icon={Maximize}
              label="Window"
              value={info.viewport}
              delay={0.1}
            />
            <StatTile
              icon={Globe}
              label="Language"
              value={info.language}
              delay={0.15}
            />
            <StatTile
              icon={Clock}
              label="Time zone"
              value={info.timezone}
              delay={0.2}
            />
            <StatTile
              icon={Wifi}
              label="Online"
              value={info.online ? "Yes" : "No"}
              tone={info.online ? "good" : "bad"}
              delay={0.25}
            />
            <StatTile
              icon={Cookie}
              label="Cookies"
              value={info.cookies ? "Enabled" : "Disabled"}
              tone={info.cookies ? "good" : "warn"}
              delay={0.3}
            />
            <StatTile
              icon={Moon}
              label="System colour preference"
              value={info.colorScheme === "dark" ? "Dark" : "Light"}
              delay={0.35}
            />
            <StatTile
              icon={Pointer}
              label="Touch"
              value={info.touch ? "Yes" : "No"}
              delay={0.4}
            />
            <StatTile
              icon={Cpu}
              label="CPU cores"
              value={info.cores ? String(info.cores) : "—"}
              delay={0.45}
            />
            <StatTile
              icon={MemoryStick}
              label="Memory"
              value={info.memoryGb ? `~${info.memoryGb} GB` : "Not shared"}
              delay={0.5}
            />
          </div>
        </div>
      ) : (
        <IdleHint>Nothing is collected until you press the button.</IdleHint>
      )}
    </ToolCard>
  );
}
