"use client";

import { useState } from "react";
import {
  Bell,
  Camera,
  Globe,
  Mic,
  Play,
  RefreshCw,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getPermissionInfo,
  PERM_STATE_LABEL,
  PERMISSION_LABELS,
  permissionsReport,
  type PermissionInfo,
  type PermissionKey,
  type PermState,
} from "./diagnostics";
import { IdleHint, ToolButton, ToolCard } from "./tool-shell";

const ICONS: Record<PermissionKey, LucideIcon> = {
  notifications: Bell,
  camera: Camera,
  microphone: Mic,
  geolocation: Globe,
};

const STATE_STYLE: Record<PermState, string> = {
  granted: "border-[#5ee0a8]/40 bg-[#5ee0a8]/15 text-[#a7f3d0]",
  denied: "border-[#ff9bb3]/40 bg-[#ff9bb3]/15 text-[#ffe4ea]",
  prompt: "border-[#9ee7ff]/35 bg-[#22d3ee]/10 text-[#cffafe]",
  unsupported: "border-white/15 bg-white/5 text-white/60",
};

export function PermissionsTool() {
  const [info, setInfo] = useState<PermissionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [testSent, setTestSent] = useState(false);

  async function run() {
    setBusy(true);
    setInfo(await getPermissionInfo());
    setRunKey((k) => k + 1);
    setBusy(false);
  }

  function sendTest() {
    try {
      new Notification("HelpDesk First", {
        body: "Notifications are working on this device.",
      });
      setTestSent(true);
    } catch {
      setTestSent(false);
    }
  }

  const report = info ? permissionsReport(info) : null;
  const keys = Object.keys(PERMISSION_LABELS) as PermissionKey[];

  return (
    <ToolCard
      id="permissions"
      icon={Shield}
      title="Notifications & permissions"
      description="Shows which features this site is allowed to use. It only reads the settings — nothing is turned on."
      report={report}
      active={busy}
      live={
        busy
          ? "Checking permissions"
          : info
            ? "Permission check finished"
            : undefined
      }
      actions={
        <ToolButton
          icon={busy || info ? RefreshCw : Play}
          spinning={busy}
          onClick={run}
          disabled={busy}
        >
          {busy ? "Checking…" : info ? "Check again" : "Check permissions"}
        </ToolButton>
      }
    >
      {info ? (
        <div key={runKey} className="grid gap-3">
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {keys.map((k, i) => {
              const Icon = ICONS[k];
              const state = info[k];
              return (
                <li
                  key={k}
                  className="hf-pop flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                    <Icon className="h-5 w-5 text-[#c9b8ff]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 font-extrabold">
                    {PERMISSION_LABELS[k]}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-extrabold",
                      STATE_STYLE[state]
                    )}
                  >
                    {PERM_STATE_LABEL[state]}
                  </span>
                </li>
              );
            })}
          </ul>
          {info.notifications === "granted" && (
            <div className="flex flex-wrap items-center gap-3">
              <ToolButton variant="ghost" icon={Bell} onClick={sendTest}>
                Send a test notification
              </ToolButton>
              {testSent && (
                <span
                  className="hf-rise text-xs font-semibold text-white/70"
                  aria-live="polite"
                >
                  Sent — if nothing appeared, check Focus / Do Not Disturb.
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <IdleHint>
          Press “Check permissions” to see what this site can use.
        </IdleHint>
      )}
    </ToolCard>
  );
}
