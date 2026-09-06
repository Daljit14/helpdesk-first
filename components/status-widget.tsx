"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type StatusResponse = {
  ok: boolean;
  checks: Record<string, { ok: boolean; ms: number | null }>;
  timestamp: string;
};

export function StatusWidget() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function check() {
    setLoading(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      setStatus(await res.json());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void check();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="glass mt-8 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          {loading ? (
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          ) : status?.ok ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <XCircle className="h-4 w-4 text-rose-500" />
          )}
          {loading
            ? "Checking…"
            : status?.ok
              ? "All systems operational"
              : "Degraded"}
        </div>
        <Button size="sm" variant="ghost" onClick={check} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {status && (
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          {Object.entries(status.checks).map(([name, check]) => (
            <div key={name}>
              <dt className="capitalize text-muted-foreground">{name}</dt>
              <dd className="mt-1 flex items-center gap-1 font-mono font-medium">
                {check.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-rose-500" />
                )}
                {check.ok ? "Operational" : "Down"}
                {check.ms !== null && ` · ${check.ms}ms`}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
