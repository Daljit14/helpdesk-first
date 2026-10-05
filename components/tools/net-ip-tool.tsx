"use client";

import { useEffect, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Globe,
  Lock,
  MapPin,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import type { ToolReport } from "./diagnostics";
import { maskIp, vpnHints, type TraceInfo } from "./net-sec-logic";
import { errorMessage, fetchTrace } from "./net-probe";
import { Panel, SectionLabel } from "./net-sec-ui";
import { StatTile, ToolButton, ToolCard, ToolNotice } from "./tool-shell";

function countryName(code: string | null): string {
  if (!code) return "Unknown";
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(
        code.toUpperCase()
      ) ?? code
    );
  } catch {
    return code;
  }
}

function prettyHttp(v: string | null): string {
  if (!v) return "—";
  return v.replace(/^http\//i, "HTTP/").replace(/^HTTP\/(\d)$/, "HTTP/$1");
}

export function NetIpTool() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [trace, setTrace] = useState<TraceInfo | null>(null);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [zone, setZone] = useState("");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function run() {
    setState("loading");
    setRevealed(false);
    try {
      const info = await fetchTrace();
      if (!alive.current) return;
      setTrace(info);
      setZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
      setState("done");
    } catch (err) {
      if (!alive.current) return;
      setError(errorMessage(err));
      setState("error");
    }
  }

  const hint = trace ? vpnHints(trace) : null;
  const country = trace ? countryName(trace.loc) : "";
  const ipShown = trace?.ip
    ? revealed
      ? trace.ip
      : maskIp(trace.ip)
    : "Unavailable";

  const report: ToolReport | null =
    trace && hint
      ? {
          tool: "Connection info",
          tone: "info",
          verdict: `Connecting from ${country}${trace.colo ? ` via the ${trace.colo} network hub` : ""}`,
          tip: "If this country or hub isn't where you expect, a VPN, proxy or mobile carrier routing may be in use. Websites see this address, not your device's private one.",
          lines: [
            ["Public IP", ipShown + (revealed ? "" : " (hidden)")],
            ["Country", country],
            ["Cloudflare hub", trace.colo ?? "—"],
            ["HTTP version", prettyHttp(trace.http)],
            ["TLS version", trace.tls ?? "—"],
            ["VPN hint", hint.label],
            ["Browser time zone", zone || "—"],
          ],
        }
      : null;

  return (
    <ToolCard
      id="net-ip"
      icon={MapPin}
      title="My connection info"
      description="Shows what websites can see about your connection: public IP, country, and how your browser connects. Uses Cloudflare's trace page — nothing is stored."
      active={state === "loading"}
      report={report}
      live={
        state === "loading"
          ? "Looking up your connection"
          : state === "error"
            ? "Lookup failed"
            : report?.verdict
      }
      actions={
        <ToolButton
          icon={state === "done" || state === "error" ? RefreshCw : Play}
          spinning={state === "loading"}
          disabled={state === "loading"}
          onClick={run}
        >
          {state === "loading"
            ? "Looking up…"
            : state === "idle"
              ? "Look up my connection"
              : "Look up again"}
        </ToolButton>
      }
    >
      {state === "error" && (
        <ToolNotice tone="warn" title="Couldn't look up your connection">
          {error === "timed out"
            ? "The lookup timed out."
            : "The lookup was blocked or failed."}{" "}
          You may be offline, or a firewall or privacy extension is blocking
          cloudflare.com. Try again, or switch networks.
        </ToolNotice>
      )}
      {state === "idle" && (
        <p className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-5 text-center text-sm font-semibold text-white/60">
          Your IP address stays hidden on screen until you choose to show it.
        </p>
      )}
      {state === "done" && trace && hint && (
        <div className="grid gap-4">
          <Panel className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <SectionLabel>Public IP address</SectionLabel>
              <p
                className="mt-1 break-all font-mono text-xl font-extrabold tracking-wide"
                aria-live="polite"
              >
                {ipShown}
              </p>
            </div>
            <ToolButton
              variant="ghost"
              icon={revealed ? EyeOff : Eye}
              aria-pressed={revealed}
              onClick={() => setRevealed((v) => !v)}
            >
              {revealed ? "Hide IP" : "Show IP"}
            </ToolButton>
          </Panel>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <StatTile
              icon={Globe}
              label="Country"
              value={country}
              delay={0.03}
            />
            <StatTile
              icon={Server}
              label="Cloudflare hub"
              value={trace.colo ?? "—"}
              delay={0.06}
            />
            <StatTile
              icon={ShieldCheck}
              label="Browser time zone"
              value={zone || "—"}
              delay={0.09}
            />
            <StatTile
              icon={Server}
              label="HTTP version"
              value={prettyHttp(trace.http)}
              delay={0.12}
            />
            <StatTile
              icon={Lock}
              label="TLS version"
              value={trace.tls ?? "—"}
              delay={0.15}
            />
            <StatTile
              icon={ShieldCheck}
              label="WARP / gateway"
              value={
                trace.warp === "on" || trace.warp === "plus"
                  ? "WARP on"
                  : trace.gateway === "on"
                    ? "Gateway on"
                    : "Not detected"
              }
              tone={hint.tone === "info" ? "info" : undefined}
              delay={0.18}
            />
          </div>
          <p className="text-xs font-semibold text-white/60">{hint.label}.</p>
          <Panel>
            <p className="text-sm font-extrabold">What a VPN changes</p>
            <ul className="mt-2 grid gap-1.5 pl-4 text-sm font-medium text-white/80 [&>li]:list-disc">
              <li>
                Websites see the VPN server&apos;s IP and country instead of
                yours.
              </li>
              <li>
                Your internet provider can no longer see which sites you visit —
                only that you use a VPN.
              </li>
              <li>
                Speed can drop and some work sites may block or behave
                differently.
              </li>
              <li>
                If the country here is wrong for you, check whether a VPN or
                proxy is on.
              </li>
            </ul>
          </Panel>
          <p className="text-xs font-semibold text-white/55">
            Country is approximate and based on your IP address. Internet
            provider names aren&apos;t included in this lookup.
          </p>
        </div>
      )}
    </ToolCard>
  );
}
