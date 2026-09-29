"use client";

import { useState, useTransition } from "react";
import {
  transitionKnowledgeGuide,
  updateKnowledgeGuideMetadata,
} from "@/app/actions/knowledge";
import type {
  GuideRevision,
  KnowledgeGuide,
  GuideStatus,
} from "@/lib/knowledge/governance";
import { BookOpen, CheckCircle2, Clock, FileText } from "lucide-react";
import {
  EmptyState,
  Panel,
  StatusPill,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

const FIELD =
  "h-10 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SMALL_FIELD =
  "mt-1 block h-9 w-full min-w-0 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PRIMARY_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground shadow-sm transition-transform hover:-translate-y-px disabled:opacity-60";
const OUTLINE_SMALL =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-extrabold text-foreground transition-colors hover:border-primary/40 hover:bg-muted/60 disabled:opacity-60";

const STATUS_TONE: Record<GuideStatus, StatTone> = {
  draft: "neutral",
  in_review: "warn",
  approved: "good",
  retired: "danger",
};

const nextActions: Record<GuideStatus, { label: string; to: GuideStatus }[]> = {
  draft: [{ label: "Send to review", to: "in_review" }],
  in_review: [
    { label: "Approve", to: "approved" },
    { label: "Back to draft", to: "draft" },
  ],
  approved: [{ label: "Retire", to: "retired" }],
  retired: [{ label: "Back to draft", to: "draft" }],
};

export function KnowledgeTable({
  guides,
  canWrite,
  revisions,
}: {
  guides: KnowledgeGuide[];
  canWrite: boolean;
  revisions: Record<string, GuideRevision[]>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  function transition(guideId: string, to: GuideStatus) {
    startTransition(async () => {
      const result = await transitionKnowledgeGuide({
        guideId,
        to,
        reviewer: to === "approved" ? reviewer : undefined,
      });
      setMessage("error" in result ? result.error : "Guide updated.");
    });
  }
  return (
    <Panel
      title="Approved support guides"
      description={`${guides.length} ${guides.length === 1 ? "guide" : "guides"} under governance`}
      icon={BookOpen}
      delay={0.2}
      flush
    >
      <div className="space-y-4 px-5 pt-4 sm:px-6">
        {message && (
          <p
            className="hf-swap flex items-center gap-2 rounded-2xl border border-primary/30 bg-secondary/60 p-3 text-sm font-bold"
            role="status"
          >
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
            {message}
          </p>
        )}
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="min-w-[200px] flex-1 text-sm font-bold">
            Search
            <input
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={`${FIELD} mt-1`}
            />
          </label>
          <label className="min-w-[160px] text-sm font-bold">
            Status
            <select
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={`${FIELD} mt-1`}
            >
              <option value="">All statuses</option>
              {(["draft", "in_review", "approved", "retired"] as const).map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                )
              )}
            </select>
          </label>
          <button type="submit" className={PRIMARY_BUTTON}>
            Filter
          </button>
        </form>
        {canWrite && (
          <label className="block max-w-sm text-sm font-bold">
            Reviewer name for approvals
            <input
              value={reviewer}
              onChange={(event) => setReviewer(event.target.value)}
              className={`${FIELD} mt-1`}
            />
          </label>
        )}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              {[
                "Title",
                "Slug",
                "Status",
                "Version",
                "Risk tier",
                "Platforms",
                "Expiry",
                "Reviewer",
                "Actions",
              ].map((heading) => (
                <th key={heading} className="px-3 py-3 font-extrabold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guides.map((guide) => (
              <tr
                key={guide.id}
                className="border-b border-border/60 align-top"
              >
                <td className="px-3 py-3 font-bold">{guide.title}</td>
                <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                  {guide.slug}
                </td>
                <td className="px-3 py-3">
                  <StatusPill tone={STATUS_TONE[guide.status] ?? "neutral"}>
                    {guide.status}
                  </StatusPill>
                </td>
                <td className="px-3 py-3 tabular-nums">{guide.version}</td>
                <td className="px-3 py-3">{guide.riskTier}</td>
                <td className="px-3 py-3">
                  {guide.supportedPlatforms.join(", ")}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {guide.expiresAt
                    ? new Date(guide.expiresAt).toLocaleDateString()
                    : "Never"}
                </td>
                <td className="px-3 py-3">{guide.reviewer ?? "—"}</td>
                <td className="px-3 py-3">
                  {canWrite && (
                    <div className="flex flex-wrap gap-1.5">
                      {nextActions[guide.status].map((action) => (
                        <button
                          key={action.to}
                          type="button"
                          className={OUTLINE_SMALL}
                          disabled={pending}
                          onClick={() => transition(guide.id, action.to)}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <details className="mt-2">
                    <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-primary hover:underline">
                      <FileText className="h-3.5 w-3.5" aria-hidden />
                      Metadata
                    </summary>
                    <MetadataForm guide={guide} onMessage={setMessage} />
                  </details>
                  <details className="mt-2">
                    <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-primary hover:underline">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      History
                    </summary>
                    <ul className="mt-2 space-y-2 text-xs">
                      {(revisions[guide.id] ?? []).length === 0 ? (
                        <li className="text-muted-foreground">
                          No revisions recorded.
                        </li>
                      ) : (
                        revisions[guide.id].map((revision) => (
                          <li
                            key={revision.id}
                            className="rounded-xl border border-border bg-muted/30 p-2"
                          >
                            <p className="font-bold">
                              {revision.fromStatus ?? "—"} →{" "}
                              {revision.toStatus ?? "—"} · v{revision.version}
                            </p>
                            <p className="text-muted-foreground">
                              Reviewer: {revision.reviewer ?? "—"} · Note:{" "}
                              {revision.note ?? "—"}
                            </p>
                            <time
                              dateTime={revision.createdAt}
                              className="text-muted-foreground"
                            >
                              {new Date(revision.createdAt).toLocaleString()}
                            </time>
                          </li>
                        ))
                      )}
                    </ul>
                  </details>
                  {!canWrite && (
                    <span className="mt-2 inline-block">
                      <StatusPill tone="neutral">Read only</StatusPill>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {guides.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title="No guides match"
            body="Try a different search or status filter."
          />
        )}
      </div>
    </Panel>
  );
}

function MetadataForm({
  guide,
  onMessage,
}: {
  guide: KnowledgeGuide;
  onMessage: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="mt-2 grid min-w-[220px] gap-2 rounded-2xl border border-border bg-muted/30 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await updateKnowledgeGuideMetadata({
            guideId: guide.id,
            sourceUrl: String(form.get("sourceUrl") ?? ""),
            sourceOwner: String(form.get("sourceOwner") ?? ""),
            expiresAt: String(form.get("expiresAt") ?? ""),
            riskTier: String(form.get("riskTier") ?? "low"),
            supportedPlatforms: String(form.get("supportedPlatforms") ?? "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          });
          onMessage("error" in result ? result.error : "Metadata updated.");
        });
      }}
    >
      <label className="text-xs font-bold">
        Source URL
        <input
          name="sourceUrl"
          defaultValue={guide.sourceUrl ?? ""}
          className={SMALL_FIELD}
        />
      </label>
      <label className="text-xs font-bold">
        Source owner
        <input
          name="sourceOwner"
          defaultValue={guide.sourceOwner ?? ""}
          className={SMALL_FIELD}
        />
      </label>
      <label className="text-xs font-bold">
        Expiry
        <input type="datetime-local" name="expiresAt" className={SMALL_FIELD} />
      </label>
      <label className="text-xs font-bold">
        Platforms
        <input
          name="supportedPlatforms"
          defaultValue={guide.supportedPlatforms.join(", ")}
          className={SMALL_FIELD}
        />
      </label>
      <button type="submit" className={OUTLINE_SMALL} disabled={pending}>
        Save metadata
      </button>
    </form>
  );
}
