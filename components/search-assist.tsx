"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Platform } from "@/lib/helpdesk-data";
import type { AiIntakeOutput } from "@/lib/ai/types";
import { getIssueBySlug, suggestIssues } from "@/lib/search";
import { IssueCard } from "./issue-card";

type SearchAssistProps = {
  query: string;
  platform?: Platform | null;
  backParams?: string;
};

type AiState =
  | { status: "ok"; output: AiIntakeOutput }
  | { status: "escalate"; reason: string }
  | null;

function assistantHref(query: string, platform?: Platform | null): string {
  const params = new URLSearchParams({ q: query });
  if (platform) params.set("platform", platform);
  return `/assistant?${params.toString()}`;
}

export function SearchAssist({
  query,
  platform = null,
  backParams = "",
}: SearchAssistProps) {
  const [aiState, setAiState] = useState<AiState>(null);
  const [loading, setLoading] = useState(false);
  const suggestions = useMemo(
    () => suggestIssues(query, platform),
    [platform, query]
  );
  const continueHref = assistantHref(query, platform);

  useEffect(() => {
    if (query.trim().length < 3) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setAiState(null);
      try {
        const response = await fetch("/api/ai/intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: query, platform }),
          signal: controller.signal,
        });
        if (!response.ok) return;

        const data = (await response.json()) as {
          status?: string;
          output?: AiIntakeOutput;
          reason?: string;
        };
        if (data.status === "ok" && data.output) {
          setAiState({ status: "ok", output: data.output });
        } else if (data.status === "escalate") {
          setAiState({
            status: "escalate",
            reason:
              data.reason ??
              "The assistant could not safely match this request to a guide.",
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setAiState(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 500);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [platform, query]);

  const matchedIssue =
    aiState?.status === "ok" && aiState.output.matchedIssueSlug
      ? getIssueBySlug(aiState.output.matchedIssueSlug)
      : undefined;
  const secondaryIssues =
    aiState?.status === "ok"
      ? (aiState.output.suggestedIssueSlugs ?? [])
          .filter((slug) => slug !== aiState.output.matchedIssueSlug)
          .map((slug) => getIssueBySlug(slug))
          .filter((issue): issue is NonNullable<typeof issue> => Boolean(issue))
          .slice(0, 3)
      : [];

  return (
    <div className="space-y-6">
      {loading && (
        <div className="glass-strong p-6" role="status" aria-live="polite">
          <span className="animate-pulse text-muted-foreground">
            Looking into it…
          </span>
        </div>
      )}

      {aiState && (
        <section className="glass-strong space-y-4 p-6">
          <h2 className="text-lg font-semibold">Assistant answer</h2>
          {aiState.status === "ok" ? (
            <>
              <p className="text-muted-foreground">
                {aiState.output.explanation ??
                  "I found some guidance that may help."}
              </p>
              {matchedIssue && (
                <Link
                  className="block font-medium underline underline-offset-4"
                  href={`/issues/${matchedIssue.id}`}
                >
                  Open guide: {matchedIssue.title}
                </Link>
              )}
              {secondaryIssues.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {secondaryIssues.map((issue) => (
                    <Link
                      key={issue.id}
                      className="text-muted-foreground underline underline-offset-4"
                      href={`/issues/${issue.id}`}
                    >
                      {issue.title}
                    </Link>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">{aiState.reason}</p>
          )}
        </section>
      )}

      <Link
        className="inline-block text-sm font-medium underline underline-offset-4"
        href={continueHref}
      >
        Continue with the assistant
      </Link>

      {suggestions.length > 0 ? (
        <section aria-label="Closest matches">
          <h2 className="mb-3 text-lg font-semibold">Closest matches</h2>
          <ul className="grid gap-4">
            {suggestions.map((issue) => (
              <IssueCard key={issue.id} issue={issue} backParams={backParams} />
            ))}
          </ul>
        </section>
      ) : (
        <div className="glass-strong p-8 text-center">
          <p className="text-lg font-medium">No matching problems found.</p>
          <p className="mt-2 text-muted-foreground">
            Try a different search term, category, or platform filter.
          </p>
        </div>
      )}
    </div>
  );
}
