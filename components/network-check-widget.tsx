"use client";

import { useState } from "react";
import { Wifi, Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  measureLatency,
  measureDownloadSpeed,
  summarizeLatency,
  getConnectionInfo,
  type ConnectionInfo,
} from "@/lib/network-check";

type Result = {
  online: boolean;
  latencyMs: number | null;
  jitterMs: number | null;
  downloadMbps: number | null;
  connection: ConnectionInfo | null;
};

function interpret(result: Result): string {
  if (!result.online) {
    return "This device could not reach the server at all — that points at your network connection, not this site.";
  }
  if (result.latencyMs !== null && result.latencyMs > 300) {
    return "Latency is high. That usually means a weak Wi-Fi signal, a congested network, or VPN overhead.";
  }
  if (result.downloadMbps !== null && result.downloadMbps < 5) {
    return "Download speed is low for typical work use (video calls, cloud sync). Try testing on a wired connection.";
  }
  if (result.jitterMs !== null && result.jitterMs > 80) {
    return "Latency is inconsistent between requests — a common cause of choppy calls even when the average looks fine.";
  }
  return "Connection looks healthy from this device right now.";
}

export function NetworkCheckWidget() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setRunning(true);
    const samples = await measureLatency(4);
    const { avgMs, jitterMs } = summarizeLatency(samples);
    const online = samples.some((s) => s.ok);
    const downloadMbps = online ? await measureDownloadSpeed() : null;

    setResult({
      online,
      latencyMs: avgMs,
      jitterMs,
      downloadMbps,
      connection: getConnectionInfo(),
    });
    setRunning(false);
  };

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <Wifi className="h-4 w-4 text-indigo-500" aria-hidden />
          Network check
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={running}>
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Running…
            </>
          ) : result ? (
            <>
              <RefreshCw className="h-4 w-4" /> Run again
            </>
          ) : (
            "Run network check"
          )}
        </Button>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Measures latency, jitter, and download speed from your browser to this
        site — useful before working through a Wi-Fi or VPN guide.
      </p>

      {result && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-1 flex items-center gap-1 font-mono font-medium">
                {result.online ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-500" />
                )}
                {result.online ? "Online" : "Unreachable"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Latency</dt>
              <dd className="mt-1 font-mono font-medium">
                {result.latencyMs !== null
                  ? `${Math.round(result.latencyMs)} ms`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Jitter</dt>
              <dd className="mt-1 font-mono font-medium">
                {result.jitterMs !== null
                  ? `${Math.round(result.jitterMs)} ms`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Download</dt>
              <dd className="mt-1 font-mono font-medium">
                {result.downloadMbps !== null
                  ? `${result.downloadMbps.toFixed(1)} Mbps`
                  : "—"}
              </dd>
            </div>
          </dl>

          {result.connection && (
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              Reported connection:{" "}
              {result.connection.effectiveType ?? "unknown"}
              {result.connection.downlinkMbps !== null &&
                ` · ~${result.connection.downlinkMbps} Mbps downlink`}
              {result.connection.rttMs !== null &&
                ` · ${result.connection.rttMs} ms RTT`}
              {result.connection.saveData && " · data saver on"}
            </p>
          )}

          <p className="mt-4 text-sm">{interpret(result)}</p>
        </>
      )}
    </div>
  );
}
