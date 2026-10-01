"use client";

import { useEffect, useState } from "react";

export type FooterStatus = "checking" | "ok" | "degraded" | "down" | "unknown";

const POLL_MS = 60_000;

/**
 * Polls /api/status once a minute. State is only set from async callbacks
 * (never synchronously in the effect body). A failed request falls back to
 * "unknown" so the footer can show a neutral "System status" label.
 */
export function useLiveStatus(): FooterStatus {
  const [status, setStatus] = useState<FooterStatus>("checking");

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    async function check() {
      if (typeof fetch !== "function") {
        if (active) setStatus("unknown");
        return;
      }
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          ok?: boolean;
          degraded?: boolean;
        };
        if (!active) return;
        if (typeof body?.ok !== "boolean") setStatus("unknown");
        else if (!body.ok) setStatus("down");
        else setStatus(body.degraded ? "degraded" : "ok");
      } catch {
        if (active) setStatus("unknown");
      }
    }

    const initial = window.setTimeout(() => void check(), 0);
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(initial);
      window.clearInterval(tick);
    };
  }, []);

  return status;
}

export const STATUS_TEXT: Record<FooterStatus, string> = {
  checking: "Checking status…",
  ok: "All systems operational",
  degraded: "Some services degraded",
  down: "Service disruption",
  unknown: "System status",
};

export const STATUS_DOT: Record<FooterStatus, string> = {
  checking: "bg-muted-foreground",
  ok: "bg-status-success",
  degraded: "bg-status-warning",
  down: "bg-status-danger",
  unknown: "bg-muted-foreground",
};
