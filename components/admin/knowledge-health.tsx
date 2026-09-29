"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Activity, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import {
  reviewFindingAction,
  runKnowledgeHealthNowAction,
} from "@/app/actions/knowledge-health";
import type { Finding } from "@/lib/knowledge/health";
import {
  EmptyState,
  Panel,
  StatusPill,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

const PRIMARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";
const SMALL_PRIMARY =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";
const SMALL_OUTLINE =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-extrabold text-foreground transition-colors hover:border-primary/40 hover:bg-muted/60 disabled:opacity-60";

const severityOrder = ["critical", "warning", "info"] as const;
const severityTone: Record<string, StatTone> = {
  critical: "danger",
  warning: "warn",
  info: "info",
};
const severityBorder: Record<string, string> = {
  critical: "border-status-danger/40 bg-status-danger/5",
  warning: "border-status-warning/40 bg-status-warning/5",
  info: "border-border bg-card/40",
};
const kindLabels: Record<string, string> = {
  outdated: "Outdated",
  broken_link: "Broken link",
  low_success: "Low success",
  high_escalation: "High escalation",
  missing_guide: "Missing guide",
  conflicting: "Conflicting",
};

export function KnowledgeHealth({
  findings,
  canWrite,
}: {
  findings: Finding[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    const group = grouped.get(finding.severity) ?? [];
    group.push(finding);
    grouped.set(finding.severity, group);
  }

  function runScan() {
    startTransition(async () => {
      const result = await runKnowledgeHealthNowAction();
      setMessage(
        "error" in result
          ? result.error
          : `Scan complete: ${result.findings} findings, ${result.linksChecked} links checked.`
      );
    });
  }

  function review(findingId: string, status: "acknowledged" | "dismissed") {
    startTransition(async () => {
      const result = await reviewFindingAction(findingId, status);
      setMessage("error" in result ? result.error : "Finding reviewed.");
    });
  }

  return (
    <Panel
      title="Knowledge health"
      description="Advisory findings from recent support outcomes and guide metadata."
      icon={Activity}
      delay={0.3}
      actions={
        <button
          type="button"
          onClick={runScan}
          disabled={pending}
          className={PRIMARY_BUTTON}
        >
          <RefreshCw
            className={`h-4 w-4 ${pending ? "animate-spin" : ""}`}
            aria-hidden
          />
          Run scan now
        </button>
      }
    >
      {message && (
        <p
          className="hf-swap mb-4 flex items-center gap-2 rounded-2xl border border-primary/30 bg-secondary/60 p-3 text-sm font-bold"
          role="status"
        >
          <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
          {message}
        </p>
      )}
      {findings.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="All clear"
          body="No findings yet — the nightly scan runs at 03:30 UTC."
        />
      ) : (
        <div className="space-y-5">
          {severityOrder.map((severity) => {
            const severityFindings = grouped.get(severity) ?? [];
            if (severityFindings.length === 0) return null;
            return (
              <div key={severity}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold capitalize">
                  {severity}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                    {severityFindings.length}
                  </span>
                </h3>
                <div className="space-y-3">
                  {severityFindings.map((finding, index) => (
                    <article
                      key={finding.id}
                      className={`hf-adm-card hf-adm-row rounded-2xl border p-4 ${
                        severityBorder[finding.severity] ?? "border-border"
                      }`}
                      style={{
                        animationDelay: `${Math.min(index, 12) * 0.04}s`,
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill
                          tone={severityTone[finding.severity] ?? "neutral"}
                          pulse={
                            finding.severity === "critical" &&
                            finding.status === "open"
                          }
                        >
                          <span className="capitalize">{finding.severity}</span>
                        </StatusPill>
                        <StatusPill tone="neutral">
                          {kindLabels[finding.kind] ?? finding.kind}
                        </StatusPill>
                        {finding.guideSlug && (
                          <Link
                            className="font-mono text-xs font-bold text-primary hover:underline"
                            href={`/issues/${finding.guideSlug}`}
                          >
                            {finding.guideSlug}
                          </Link>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-semibold">
                        {finding.summary}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last seen{" "}
                        <time dateTime={finding.lastSeenAt}>
                          {new Date(finding.lastSeenAt).toLocaleString()}
                        </time>
                      </p>
                      {canWrite && finding.status === "open" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={SMALL_PRIMARY}
                            disabled={pending}
                            onClick={() => review(finding.id, "acknowledged")}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                            Acknowledge
                          </button>
                          <button
                            type="button"
                            className={SMALL_OUTLINE}
                            disabled={pending}
                            onClick={() => review(finding.id, "dismissed")}
                          >
                            <XCircle className="h-3.5 w-3.5" aria-hidden />
                            Dismiss
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
