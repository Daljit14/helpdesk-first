"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { reviewKnowledgeDraft } from "@/app/actions/knowledge";
import type { KnowledgeDraft } from "@/lib/knowledge/learning";
import { Button } from "@/components/ui/button";

export function KnowledgeDrafts({
  drafts,
  canWrite,
}: {
  drafts: KnowledgeDraft[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const gaps = drafts.filter((draft) => !draft.relatedSlug).length;
  function review(draftId: string, status: "approved" | "rejected") {
    startTransition(async () => {
      const note = document.querySelector<HTMLTextAreaElement>(
        `textarea[data-draft-id="${draftId}"]`
      )?.value;
      const result = await reviewKnowledgeDraft({ draftId, status, note });
      setMessage("error" in result ? result.error : "Draft reviewed.");
    });
  }
  return (
    <section className="glass mt-6 overflow-hidden p-4">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Learning drafts</h2>
        <p className="text-sm text-muted-foreground">
          {drafts.filter((draft) => draft.status === "draft").length} awaiting
          review · {gaps} knowledge gaps (no matching guide)
        </p>
      </div>
      {message && (
        <p className="mb-3 text-sm" role="status">
          {message}
        </p>
      )}
      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No learning drafts yet. Drafts appear when a ticket is confirmed
          resolved.
        </p>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => (
            <article
              key={draft.id}
              className="rounded-2xl border border-border/60 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{draft.title}</h3>
                <span className="glass-pill px-2 py-1 text-xs">
                  {draft.kind === "guide_update"
                    ? "Guide update"
                    : "New guide — knowledge gap"}
                </span>
                <span className="glass-pill px-2 py-1 text-xs">
                  {draft.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {draft.confirmation === "user_confirmed"
                    ? "User confirmed"
                    : "Staff verification exception"}
                </span>
              </div>
              <p className="mt-2 text-sm">
                {draft.relatedSlug ? (
                  <>
                    Related guide:{" "}
                    <Link
                      className="underline"
                      href={`/issues/${draft.relatedSlug}`}
                    >
                      {draft.relatedSlug}
                    </Link>
                  </>
                ) : (
                  "No matching catalog guide"
                )}{" "}
                ·{" "}
                <Link
                  className="underline"
                  href={`/admin/tickets/${draft.ticketId}`}
                >
                  Source ticket
                </Link>
              </p>
              <DetailList title="Symptoms" items={draft.content.symptoms} />
              <p className="mt-3 text-sm">
                <strong>Root cause:</strong> {draft.content.rootCause || "—"}
              </p>
              <DetailList
                title="Resolution steps"
                items={draft.content.resolutionSteps}
                ordered
              />
              <p className="mt-3 text-sm">
                <strong>Preventive:</strong> {draft.content.preventive ?? "—"}
              </p>
              <p className="mt-1 text-sm">
                <strong>Tools:</strong> {draft.content.toolsUsed ?? "—"}
              </p>
              {draft.content.attemptedGuide &&
                draft.content.attemptedGuide.failedSteps.length > 0 && (
                  <p className="mt-1 text-sm">
                    <strong>Attempted guide failed steps:</strong>{" "}
                    {draft.content.attemptedGuide.failedSteps
                      .map((step) => step + 1)
                      .join(", ")}
                  </p>
                )}
              {draft.status === "draft" && canWrite && (
                <div className="mt-4 grid gap-2">
                  <textarea
                    data-draft-id={draft.id}
                    aria-label={`Review note for ${draft.title}`}
                    placeholder="Review note (optional)"
                    className="min-h-20 rounded-xl border border-border bg-background/60 p-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => review(draft.id, "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => review(draft.id, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DetailList({
  title,
  items,
  ordered = false,
}: {
  title: string;
  items: string[];
  ordered?: boolean;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <div className="mt-3 text-sm">
      <strong>{title}:</strong>
      {items.length === 0 ? (
        <span> —</span>
      ) : (
        <List className="mt-1 list-inside list-disc space-y-1">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </List>
      )}
    </div>
  );
}
