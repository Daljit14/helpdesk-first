"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { reviewKnowledgeDraft } from "@/app/actions/knowledge";
import type {
  KnowledgeDraft,
  KnowledgeDraftStatus,
} from "@/lib/knowledge/learning";
import { describeRedactions } from "@/lib/knowledge/learning-redaction";
import { riskLabel } from "@/lib/investigation/policy";
import { Button } from "@/components/ui/button";

const statusLabels: Record<KnowledgeDraftStatus, string> = {
  queued: "Queued",
  generating: "Generating",
  draft: "Awaiting review",
  needs_security_review: "Needs security review",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
  failed: "Failed validation",
};

type Panel = "edit" | "revision" | "reject" | "regenerate" | null;

export function KnowledgeDrafts({
  drafts,
  canWrite,
}: {
  drafts: KnowledgeDraft[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ id: string; kind: Panel } | null>(null);
  const gaps = drafts.filter((draft) => !draft.relatedSlug).length;
  const awaiting = drafts.filter(
    (draft) =>
      draft.status === "draft" || draft.status === "needs_security_review"
  ).length;

  function submit(input: Parameters<typeof reviewKnowledgeDraft>[0]) {
    startTransition(async () => {
      const result = await reviewKnowledgeDraft(input);
      setMessage("error" in result ? result.error : "Draft updated.");
      if (!("error" in result)) setPanel(null);
    });
  }

  function fieldValue(draftId: string, name: string): string {
    return (
      document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[data-draft-id="${draftId}"][name="${name}"]`
      )?.value ?? ""
    );
  }

  return (
    <section className="glass mt-6 overflow-hidden p-4">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Learning drafts</h2>
        <p className="text-sm text-muted-foreground">
          {awaiting} awaiting review · {gaps} knowledge gaps (no matching
          guide). Drafts never publish automatically; approving creates a
          governed guide draft or revision.
        </p>
      </div>
      {message && (
        <p className="mb-3 text-sm" role="status">
          {message}
        </p>
      )}
      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No learning drafts yet. Drafts appear when a requester confirms a
          resolution.
        </p>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => {
            const reviewable =
              canWrite &&
              (draft.status === "draft" ||
                draft.status === "needs_security_review");
            const article = draft.article;
            const open = panel?.id === draft.id ? panel.kind : null;
            const revisionTargets = [
              ...(draft.relatedSlug ? [draft.relatedSlug] : []),
              ...draft.similarSlugs.filter(
                (slug) => slug !== draft.relatedSlug
              ),
            ];
            return (
              <article
                key={draft.id}
                className="rounded-2xl border border-border/60 p-4"
                aria-labelledby={`draft-${draft.id}-title`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={`draft-${draft.id}-title`} className="font-semibold">
                    {draft.title}
                  </h3>
                  <span className="glass-pill px-2 py-1 text-xs">
                    {draft.kind === "guide_update"
                      ? "Guide update"
                      : "New guide — knowledge gap"}
                  </span>
                  <span className="glass-pill px-2 py-1 text-xs">
                    {statusLabels[draft.status]}
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
                <p className="mt-1 text-xs text-muted-foreground">
                  Generated{" "}
                  {draft.generatedAt
                    ? new Date(draft.generatedAt).toLocaleString()
                    : new Date(draft.createdAt).toLocaleString()}{" "}
                  · {draft.modelProvider ?? "deterministic"}
                  {draft.modelVersion ? ` v${draft.modelVersion}` : ""}
                  {draft.promptVersion ? ` · ${draft.promptVersion}` : ""}
                  {article
                    ? ` · confidence ${Math.round(article.confidence * 100)}%`
                    : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Privacy: {describeRedactions(draft.redactionSummary)}
                </p>
                {draft.similarSlugs.length > 0 && (
                  <p className="mt-1 text-sm">
                    <strong>Similar existing guides:</strong>{" "}
                    {draft.similarSlugs.map((slug, index) => (
                      <span key={slug}>
                        {index > 0 && ", "}
                        <Link className="underline" href={`/issues/${slug}`}>
                          {slug}
                        </Link>
                      </span>
                    ))}{" "}
                    — consider approving as a revision instead of a new guide.
                  </p>
                )}
                {draft.securityReviewRequired && (
                  <p className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
                    Security review required: one or more steps need IT approval
                    or specialist handling.
                  </p>
                )}
                {draft.failureReason && (
                  <p className="mt-2 rounded-xl border border-red-500/40 bg-red-500/10 p-2 text-sm">
                    Validation failed: {draft.failureReason}
                  </p>
                )}
                {article ? (
                  <>
                    <p className="mt-3 text-sm">
                      <strong>Problem:</strong> {article.problemSummary}
                    </p>
                    <DetailList title="Symptoms" items={article.symptoms} />
                    <p className="mt-3 text-sm">
                      <strong>Platforms:</strong>{" "}
                      {article.platforms.join(", ") || "Any"}
                    </p>
                    <p className="mt-1 text-sm">
                      <strong>Root cause:</strong> {article.rootCause}
                    </p>
                    <DetailList
                      title="Preconditions"
                      items={article.preconditions}
                    />
                    <div className="mt-3 text-sm">
                      <strong>Steps:</strong>
                      <ol className="mt-1 list-inside list-decimal space-y-1">
                        {article.steps.map((step, index) => (
                          <li key={`${index}-${step.text}`}>
                            {step.text}{" "}
                            <span className="glass-pill px-2 py-0.5 text-xs">
                              {riskLabel(step.risk)}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <DetailList
                      title="Verification"
                      items={article.verification}
                    />
                    <DetailList
                      title="Escalate when"
                      items={article.escalationConditions}
                    />
                    <DetailList title="Prevention" items={article.prevention} />
                    <DetailList
                      title="Sources"
                      items={article.sources.map(
                        (source) => `${source.type}: ${source.reference}`
                      )}
                    />
                  </>
                ) : (
                  <>
                    <DetailList
                      title="Symptoms"
                      items={draft.content.symptoms}
                    />
                    <p className="mt-3 text-sm">
                      <strong>Root cause:</strong>{" "}
                      {draft.content.rootCause || "—"}
                    </p>
                    <DetailList
                      title="Resolution steps"
                      items={draft.content.resolutionSteps}
                      ordered
                    />
                  </>
                )}
                <ReviewHistory draft={draft} />
                {reviewable && (
                  <div className="mt-4 space-y-3">
                    <div
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-label={`Actions for ${draft.title}`}
                    >
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending || !article}
                        onClick={() =>
                          submit({ draftId: draft.id, decision: "approve_new" })
                        }
                      >
                        Approve as new guide
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending || !article}
                        onClick={() =>
                          setPanel({ id: draft.id, kind: "revision" })
                        }
                      >
                        Approve as revision
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending || !article}
                        onClick={() => setPanel({ id: draft.id, kind: "edit" })}
                      >
                        Edit
                      </Button>
                      {draft.status === "draft" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            submit({
                              draftId: draft.id,
                              decision: "security_review",
                            })
                          }
                        >
                          Send for security review
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending || draft.regenerationCount >= 1}
                        onClick={() =>
                          setPanel({ id: draft.id, kind: "regenerate" })
                        }
                      >
                        Regenerate once
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          setPanel({ id: draft.id, kind: "reject" })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                    {open === "revision" && (
                      <form
                        className="grid gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          submit({
                            draftId: draft.id,
                            decision: "approve_revision",
                            targetSlug: fieldValue(draft.id, "targetSlug"),
                            note: fieldValue(draft.id, "note"),
                          });
                        }}
                      >
                        <label
                          className="text-sm"
                          htmlFor={`target-${draft.id}`}
                        >
                          Existing guide to revise
                        </label>
                        <input
                          id={`target-${draft.id}`}
                          name="targetSlug"
                          data-draft-id={draft.id}
                          list={`targets-${draft.id}`}
                          defaultValue={revisionTargets[0] ?? ""}
                          required
                          className="rounded-xl border border-border bg-background/60 p-2 text-sm"
                        />
                        <datalist id={`targets-${draft.id}`}>
                          {revisionTargets.map((slug) => (
                            <option key={slug} value={slug} />
                          ))}
                        </datalist>
                        <textarea
                          name="note"
                          data-draft-id={draft.id}
                          aria-label="Revision note"
                          placeholder="What should change in the existing guide? (optional)"
                          className="min-h-16 rounded-xl border border-border bg-background/60 p-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" disabled={pending}>
                            Record revision
                          </Button>
                          <CancelButton onClick={() => setPanel(null)} />
                        </div>
                      </form>
                    )}
                    {open === "edit" && article && (
                      <form
                        className="grid gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          submit({
                            draftId: draft.id,
                            decision: "edit",
                            edits: {
                              title: fieldValue(draft.id, "title"),
                              rootCause: fieldValue(draft.id, "rootCause"),
                              steps: fieldValue(draft.id, "steps")
                                .split(/\r?\n/)
                                .map((line) => line.trim())
                                .filter(Boolean),
                            },
                          });
                        }}
                      >
                        <label
                          className="text-sm"
                          htmlFor={`title-${draft.id}`}
                        >
                          Title
                        </label>
                        <input
                          id={`title-${draft.id}`}
                          name="title"
                          data-draft-id={draft.id}
                          defaultValue={article.title}
                          className="rounded-xl border border-border bg-background/60 p-2 text-sm"
                        />
                        <label className="text-sm" htmlFor={`root-${draft.id}`}>
                          Root cause
                        </label>
                        <textarea
                          id={`root-${draft.id}`}
                          name="rootCause"
                          data-draft-id={draft.id}
                          defaultValue={article.rootCause}
                          className="min-h-16 rounded-xl border border-border bg-background/60 p-2 text-sm"
                        />
                        <label
                          className="text-sm"
                          htmlFor={`steps-${draft.id}`}
                        >
                          Steps (one per line; each is re-checked by the risk
                          policy)
                        </label>
                        <textarea
                          id={`steps-${draft.id}`}
                          name="steps"
                          data-draft-id={draft.id}
                          defaultValue={article.steps
                            .map((step) => step.text)
                            .join("\n")}
                          className="min-h-24 rounded-xl border border-border bg-background/60 p-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" disabled={pending}>
                            Save edits
                          </Button>
                          <CancelButton onClick={() => setPanel(null)} />
                        </div>
                      </form>
                    )}
                    {open === "regenerate" && (
                      <form
                        className="grid gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          submit({
                            draftId: draft.id,
                            decision: "regenerate",
                            instructions: fieldValue(draft.id, "instructions"),
                          });
                        }}
                      >
                        <label
                          className="text-sm"
                          htmlFor={`instructions-${draft.id}`}
                        >
                          Reviewer instructions
                        </label>
                        <textarea
                          id={`instructions-${draft.id}`}
                          name="instructions"
                          data-draft-id={draft.id}
                          required
                          className="min-h-16 rounded-xl border border-border bg-background/60 p-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" disabled={pending}>
                            Regenerate
                          </Button>
                          <CancelButton onClick={() => setPanel(null)} />
                        </div>
                      </form>
                    )}
                    {open === "reject" && (
                      <form
                        className="grid gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          submit({
                            draftId: draft.id,
                            decision: "reject",
                            reason: fieldValue(draft.id, "reason"),
                          });
                        }}
                      >
                        <label
                          className="text-sm"
                          htmlFor={`reason-${draft.id}`}
                        >
                          Rejection reason (required)
                        </label>
                        <textarea
                          id={`reason-${draft.id}`}
                          name="reason"
                          data-draft-id={draft.id}
                          required
                          className="min-h-16 rounded-xl border border-border bg-background/60 p-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            disabled={pending}
                          >
                            Confirm rejection
                          </Button>
                          <CancelButton onClick={() => setPanel(null)} />
                        </div>
                      </form>
                    )}
                  </div>
                )}
                {canWrite &&
                  (draft.status === "rejected" ||
                    draft.status === "failed") && (
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          submit({ draftId: draft.id, decision: "discard" })
                        }
                      >
                        Discard (retention policy)
                      </Button>
                    </div>
                  )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="ghost" onClick={onClick}>
      Cancel
    </Button>
  );
}

function ReviewHistory({ draft }: { draft: KnowledgeDraft }) {
  const lines: string[] = [];
  if (draft.reviewedAt) {
    lines.push(
      `${statusLabels[draft.status]} on ${new Date(draft.reviewedAt).toLocaleString()}`
    );
  }
  if (draft.rejectionReason) lines.push(`Reason: ${draft.rejectionReason}`);
  if (draft.reviewNote) lines.push(`Note: ${draft.reviewNote}`);
  if (draft.reviewerInstructions)
    lines.push(`Regenerated with instructions: ${draft.reviewerInstructions}`);
  if (draft.createdGuideId)
    lines.push(
      draft.kind === "guide_update"
        ? "Recorded as a governed revision on the existing guide."
        : "Created a governed guide draft (pending governance approval)."
    );
  if (lines.length === 0) return null;
  return (
    <div className="mt-3 text-sm">
      <strong>Review history:</strong>
      <ul className="mt-1 list-inside list-disc space-y-1">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
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
