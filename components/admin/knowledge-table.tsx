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
import { Button } from "@/components/ui/button";

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
    <div className="glass overflow-x-auto p-4">
      {message && (
        <p className="mb-3 text-sm" role="status">
          {message}
        </p>
      )}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Search
          <input
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 block rounded-xl border border-border bg-background/60 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Status
          <select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="mt-1 block rounded-xl border border-border bg-background/60 px-3 py-2"
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
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      {canWrite && (
        <label className="mb-4 block max-w-sm text-sm">
          Reviewer name for approvals
          <input
            value={reviewer}
            onChange={(event) => setReviewer(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-border bg-background/60 px-3 py-2"
          />
        </label>
      )}
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
              <th key={heading} className="px-3 py-3 font-semibold">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {guides.map((guide) => (
            <tr key={guide.id} className="border-b border-border/60">
              <td className="px-3 py-3">{guide.title}</td>
              <td className="px-3 py-3 font-mono text-xs">{guide.slug}</td>
              <td className="px-3 py-3">
                <span className="glass-pill px-2 py-1">{guide.status}</span>
              </td>
              <td className="px-3 py-3">{guide.version}</td>
              <td className="px-3 py-3">{guide.riskTier}</td>
              <td className="px-3 py-3">
                {guide.supportedPlatforms.join(", ")}
              </td>
              <td className="px-3 py-3">
                {guide.expiresAt
                  ? new Date(guide.expiresAt).toLocaleDateString()
                  : "Never"}
              </td>
              <td className="px-3 py-3">{guide.reviewer ?? "—"}</td>
              <td className="px-3 py-3">
                {canWrite &&
                  nextActions[guide.status].map((action) => (
                    <Button
                      key={action.to}
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => transition(guide.id, action.to)}
                    >
                      {action.label}
                    </Button>
                  ))}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs underline">
                    Metadata
                  </summary>
                  <MetadataForm guide={guide} onMessage={setMessage} />
                </details>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs underline">
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
                          className="rounded-lg border border-border p-2"
                        >
                          <p>
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
                  <span className="text-muted-foreground">Read only</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      className="mt-2 grid gap-2 rounded-xl border border-border p-2"
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
      <label className="text-xs">
        Source URL
        <input
          name="sourceUrl"
          defaultValue={guide.sourceUrl ?? ""}
          className="block w-full rounded border border-border bg-background/60 px-2 py-1"
        />
      </label>
      <label className="text-xs">
        Source owner
        <input
          name="sourceOwner"
          defaultValue={guide.sourceOwner ?? ""}
          className="block w-full rounded border border-border bg-background/60 px-2 py-1"
        />
      </label>
      <label className="text-xs">
        Expiry
        <input
          type="datetime-local"
          name="expiresAt"
          className="block w-full rounded border border-border bg-background/60 px-2 py-1"
        />
      </label>
      <label className="text-xs">
        Platforms
        <input
          name="supportedPlatforms"
          defaultValue={guide.supportedPlatforms.join(", ")}
          className="block w-full rounded border border-border bg-background/60 px-2 py-1"
        />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Save metadata
      </Button>
    </form>
  );
}
