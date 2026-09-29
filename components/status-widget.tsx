"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StatusCheck = {
  ok: boolean;
  ms: number | null;
  detail?: string;
  degraded?: boolean;
};

type StatusResponse = {
  ok: boolean;
  degraded?: boolean;
  checks: Record<string, StatusCheck>;
  timestamp: string;
};

type CapabilityState = "ok" | "degraded" | "down" | "checking";

type Capability = {
  name: string;
  state: CapabilityState;
  text: string;
};

function stateFor(check: StatusCheck | undefined): CapabilityState {
  if (!check) return "checking";
  if (!check.ok) return "down";
  return check.degraded ? "degraded" : "ok";
}

function combinedState(
  ...checks: (StatusCheck | undefined)[]
): CapabilityState {
  if (checks.some((check) => !check)) return "checking";
  if (checks.some((check) => !check?.ok)) return "down";
  if (checks.some((check) => check?.degraded)) return "degraded";
  return "ok";
}

function stateLabel(state: CapabilityState) {
  return {
    ok: "Operational",
    degraded: "Degraded",
    down: "Unavailable",
    checking: "Checking…",
  }[state];
}

function indicatorClass(state: CapabilityState) {
  return {
    ok: "bg-status-success",
    degraded: "bg-status-warning",
    down: "bg-status-danger",
    checking: "bg-muted-foreground",
  }[state];
}

function capabilityRows(
  checks: Record<string, StatusCheck> | undefined
): Capability[] {
  const auth = checks?.auth;
  const app = checks?.app;
  const database = checks?.database;
  const ai = checks?.ai;
  const storage = checks?.storage;
  const notifications = checks?.notifications;
  const authState = stateFor(auth);
  const browseState = combinedState(app, database);
  const aiState = stateFor(ai);
  const databaseState = stateFor(database);
  const storageState = stateFor(storage);
  const ticketState =
    databaseState === "down"
      ? "down"
      : storageState === "down" || databaseState === "degraded"
        ? "degraded"
        : databaseState === "checking" || storageState === "checking"
          ? "checking"
          : "ok";
  const notificationState = stateFor(notifications);

  return [
    {
      name: "Sign in & accounts",
      state: authState,
      text:
        authState === "ok"
          ? "You can sign in normally"
          : authState === "checking"
            ? "Checking sign-in"
            : "Sign-in may fail — try again in a few minutes",
    },
    {
      name: "Browse guides & search",
      state: browseState,
      text:
        browseState === "ok"
          ? "Guides and search are available"
          : browseState === "checking"
            ? "Checking guides and search"
            : "Guides may load slowly",
    },
    {
      name: "AI assistant",
      state: aiState,
      text:
        aiState === "ok"
          ? "Chat with the assistant is available"
          : aiState === "degraded"
            ? "Assistant gives limited answers right now"
            : aiState === "checking"
              ? "Checking the assistant"
              : "Assistant unavailable — use guides or contact support",
    },
    {
      name: "Tickets & file uploads",
      state: ticketState,
      text:
        ticketState === "ok"
          ? "You can submit tickets and attach screenshots"
          : ticketState === "checking"
            ? "Checking tickets and file uploads"
            : ticketState === "down"
              ? "Ticket submission unavailable"
              : "Uploads may fail — you can still submit a ticket without attachments",
    },
    {
      name: "Email updates",
      state: notificationState,
      text:
        notificationState === "ok"
          ? "Ticket emails are being delivered"
          : notificationState === "checking"
            ? "Checking email updates"
            : "Emails may be delayed",
    },
  ];
}

function CapabilityRow({
  capability,
  index,
}: {
  capability: Capability;
  index: number;
}) {
  return (
    <li
      className="hf-rise rounded-2xl border border-border bg-card p-4"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="flex items-start gap-3">
        <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
          {capability.state === "degraded" && (
            <span className="hf-ping absolute inset-0 rounded-full bg-status-warning" />
          )}
          <span
            className={cn(
              "relative h-2.5 w-2.5 rounded-full",
              indicatorClass(capability.state)
            )}
          />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="font-bold">{capability.name}</h2>
            <span className="text-xs font-extrabold text-muted-foreground">
              {stateLabel(capability.state)}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            {capability.text}
          </p>
        </div>
      </div>
    </li>
  );
}

export function StatusWidget() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) throw new Error("status");
      const nextStatus = (await res.json()) as StatusResponse;
      setStatus(nextStatus);
      setRequestFailed(false);
    } catch {
      setStatus(null);
      setRequestFailed(true);
    } finally {
      setLastChecked(new Date().toISOString());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void check(), 0);
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(refresh);
    };
  }, [check]);

  const overallDown = requestFailed || Boolean(status && !status.ok);
  const overallDegraded = Boolean(status?.degraded);
  const overallLabel = loading
    ? "Checking…"
    : overallDown
      ? "Service disruption"
      : overallDegraded
        ? "Some services degraded"
        : "All systems operational";
  const rows = capabilityRows(status?.checks);

  return (
    <div className="mt-8">
      <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-extrabold",
                overallDown
                  ? "bg-destructive/10 text-destructive"
                  : overallDegraded
                    ? "bg-status-warning/15 text-foreground"
                    : "bg-status-success/15 text-foreground"
              )}
            >
              <span className="relative flex h-2.5 w-2.5">
                {(overallDown || overallDegraded) && (
                  <span className="hf-ping absolute inset-0 rounded-full bg-status-warning" />
                )}
                <span
                  className={cn(
                    "relative h-2.5 w-2.5 rounded-full",
                    overallDown
                      ? "bg-status-danger"
                      : overallDegraded
                        ? "bg-status-warning"
                        : "bg-status-success"
                  )}
                />
              </span>
              {overallLabel}
            </span>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              {lastChecked
                ? `Last checked ${new Date(lastChecked).toLocaleTimeString()}`
                : "Waiting for first check"}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void check()}
            disabled={loading}
            aria-label="Refresh system status"
            aria-busy={loading}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </section>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {rows.map((capability, index) => (
          <CapabilityRow
            key={capability.name}
            capability={capability}
            index={index}
          />
        ))}
      </ul>

      <p className="mt-5 text-center text-xs font-semibold text-muted-foreground">
        <Link href="/browse" className="text-primary hover:underline">
          Browse guides
        </Link>
      </p>
      <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
        Having trouble anyway?{" "}
        <Link href="/assistant" className="text-primary hover:underline">
          Ask the assistant
        </Link>{" "}
        ·{" "}
        <Link
          href="/assistant?intent=human"
          className="text-primary hover:underline"
        >
          Contact support
        </Link>
      </p>
      <span role="status" aria-live="polite" className="sr-only">
        {loading
          ? "Checking system status…"
          : lastChecked
            ? `Status updated ${new Date(lastChecked).toLocaleTimeString()}`
            : ""}
      </span>
    </div>
  );
}
