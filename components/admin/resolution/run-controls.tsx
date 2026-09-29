"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Bot, Pause, Play, ShieldCheck } from "lucide-react";
import {
  escalateAiRun,
  pauseAiRun,
  resumeAiRun,
  takeOverRun,
} from "@/app/actions/admin-resolution";
import { Panel } from "@/components/admin/ui/admin-kit";

const terminal = new Set(["resolved", "escalated", "failed"]);

const CONTROL =
  "v2-touch inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-extrabold text-foreground shadow-sm transition-all hover:-translate-y-px hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";
const CONTROL_PRIMARY =
  "v2-touch inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";
const CONTROL_DANGER =
  "v2-touch inline-flex h-10 items-center gap-2 rounded-xl border border-status-danger/40 bg-status-danger/10 px-4 text-sm font-extrabold text-status-danger shadow-sm transition-all hover:-translate-y-px hover:bg-status-danger/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";

export function RunControls({
  runId,
  status,
  canResume,
}: {
  runId: string;
  status: string;
  canResume: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const disabled = pending || terminal.has(status);
  function invoke(
    action: () => Promise<{ error: string } | { success: true }>,
    confirmation: string
  ) {
    if (disabled || !window.confirm(confirmation)) return;
    startTransition(async () => {
      const result = await action();
      setMessage("error" in result ? result.error : "Action completed.");
    });
  }
  return (
    <Panel
      id="run-controls"
      title="Controls"
      description={
        terminal.has(status)
          ? "This run has finished — controls are locked."
          : "Pause, resume, take over or escalate this AI run. Every action asks for confirmation."
      }
      icon={ShieldCheck}
      delay={0.05}
    >
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || status === "paused"}
          onClick={() =>
            invoke(
              () => pauseAiRun(runId),
              "Pause this AI run? It will remain available to resume."
            )
          }
          className={CONTROL}
        >
          <Pause className="h-4 w-4" aria-hidden />
          Pause AI
        </button>
        <button
          type="button"
          disabled={disabled || !canResume || status !== "paused"}
          onClick={() =>
            invoke(() => resumeAiRun(runId), "Resume this AI run?")
          }
          className={CONTROL_PRIMARY}
        >
          <Play className="h-4 w-4" aria-hidden />
          Resume
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            invoke(
              () => takeOverRun(runId),
              "Take over this run and assign its ticket to you?"
            )
          }
          className={CONTROL}
        >
          <Bot className="h-4 w-4" aria-hidden />
          Take over
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            invoke(
              () => escalateAiRun(runId),
              "Escalate this AI run to human support?"
            )
          }
          className={CONTROL_DANGER}
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Escalate
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="mt-3 min-h-5 text-sm font-bold text-muted-foreground"
      >
        {message}
      </p>
    </Panel>
  );
}
