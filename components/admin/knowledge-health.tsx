"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  reviewFindingAction,
  runKnowledgeHealthNowAction,
} from "@/app/actions/knowledge-health";
import type { Finding } from "@/lib/knowledge/health";
import { Button } from "@/components/ui/button";

const severityOrder = ["critical", "warning", "info"] as const;
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
    <section className="glass mt-6 overflow-hidden p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Knowledge health</h2>
          <p className="text-sm text-muted-foreground">
            Advisory findings from recent support outcomes and guide metadata.
          </p>
        </div>
        <Button type="button" onClick={runScan} disabled={pending}>
          Run scan now
        </Button>
      </div>
      {message && (
        <p className="mb-3 text-sm" role="status">
          {message}
        </p>
      )}
      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No findings yet — the nightly scan runs at 03:30 UTC.
        </p>
      ) : (
        <div className="space-y-5">
          {severityOrder.map((severity) => {
            const severityFindings = grouped.get(severity) ?? [];
            if (severityFindings.length === 0) return null;
            return (
              <div key={severity}>
                <h3 className="mb-2 text-sm font-semibold capitalize">
                  {severity}
                </h3>
                <div className="space-y-3">
                  {severityFindings.map((finding) => (
                    <article
                      key={finding.id}
                      className="rounded-2xl border border-border/60 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="glass-pill px-2 py-1 text-xs capitalize">
                          {finding.severity}
                        </span>
                        <span className="glass-pill px-2 py-1 text-xs">
                          {kindLabels[finding.kind] ?? finding.kind}
                        </span>
                        {finding.guideSlug && (
                          <Link
                            className="font-mono text-xs underline"
                            href={`/issues/${finding.guideSlug}`}
                          >
                            {finding.guideSlug}
                          </Link>
                        )}
                      </div>
                      <p className="mt-2 text-sm">{finding.summary}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Last seen{" "}
                        <time dateTime={finding.lastSeenAt}>
                          {new Date(finding.lastSeenAt).toLocaleString()}
                        </time>
                      </p>
                      {canWrite && finding.status === "open" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => review(finding.id, "acknowledged")}
                          >
                            Acknowledge
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => review(finding.id, "dismissed")}
                          >
                            Dismiss
                          </Button>
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
    </section>
  );
}
