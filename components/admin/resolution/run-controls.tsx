"use client";

import { useState, useTransition } from "react";
import {
  escalateAiRun,
  pauseAiRun,
  resumeAiRun,
  takeOverRun,
} from "@/app/actions/admin-resolution";

const terminal = new Set(["resolved", "escalated", "failed"]);

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
    <section
      aria-labelledby="run-controls-heading"
      className="glass space-y-3 p-5"
    >
      <h2 id="run-controls-heading" className="text-lg font-semibold">
        Controls
      </h2>
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
          className="v2-touch rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          Pause AI
        </button>
        <button
          type="button"
          disabled={disabled || !canResume || status !== "paused"}
          onClick={() =>
            invoke(() => resumeAiRun(runId), "Resume this AI run?")
          }
          className="v2-touch rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
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
          className="v2-touch rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
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
          className="v2-touch rounded-xl border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          Escalate
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="min-h-5 text-sm text-muted-foreground"
      >
        {message}
      </p>
    </section>
  );
}
