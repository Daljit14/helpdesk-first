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
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  EmptyState,
  Panel as AdminPanel,
  StatusPill,
  type StatTone,
} from "@/components/admin/ui/admin-kit";

const INPUT =
  "w-full min-w-0 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const BUTTON_STYLES = {
  default: "bg-primary text-primary-foreground shadow-sm hover:-translate-y-px",
  outline:
    "border border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/60",
  ghost: "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
} as const;

const statusTone: Record<KnowledgeDraftStatus, StatTone> = {
  queued: "neutral",
  generating: "info",
  draft: "warn",
  needs_security_review: "danger",
  approved: "good",
  rejected: "neutral",
  published: "good",
  failed: "danger",
};

/** Aurora-styled button used throughout the drafts review UI. */
function Button({
  variant = "default",
  type,
  disabled,
  onClick,
  children,
}: {
  variant?: keyof typeof BUTTON_STYLES;
  size?: "sm";
  type: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold transition-all disabled:opacity-60 ${BUTTON_STYLES[variant]}`}
    >
      {children}
    </button>
  );
}

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
    <AdminPanel
      title="Learning drafts"
      icon={Lightbulb}
      delay={0.25}
      description={
        <>
          {awaiting} awaiting review · {gaps} knowledge gaps (no matching
          guide). Drafts never publish automatically; approving creates a
          governed guide draft or revision.
        </>
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
      {drafts.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No learning drafts"
          body="No learning drafts yet. Drafts appear when a requester confirms a resolution."
        />
      ) : (
        <div className="space-y-4">
          {drafts.map((draft, draftIndex) => {
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
                className="hf-adm-row rounded-2xl border border-border bg-card/50 p-4 transition-colors hover:border-primary/30"
                style={{
                  animationDelay: `${Math.min(draftIndex, 12) * 0.04}s`,
                }}
                aria-labelledby={`draft-${draft.id}-title`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    id={`draft-${draft.id}-title`}
                    className="text-base font-extrabold"
                  >
                    {draft.title}
                  </h3>
                  <StatusPill
                    tone={draft.kind === "guide_update" ? "info" : "primary"}
                  >
                    {draft.kind === "guide_update"
                      ? "Guide update"
                      : "New guide — knowledge gap"}
                  </StatusPill>
                  <StatusPill
                    tone={statusTone[draft.status] ?? "neutral"}
                    pulse={draft.status === "generating"}
                  >
                    {statusLabels[draft.status]}
                  </StatusPill>
                  <span className="text-xs font-semibold text-muted-foreground">
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
                        className="font-bold text-primary hover:underline"
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
                    className="font-bold text-primary hover:underline"
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
                        <Link
                          className="font-bold text-primary hover:underline"
                          href={`/issues/${slug}`}
                        >
                          {slug}
                        </Link>
                      </span>
                    ))}{" "}
                    — consider approving as a revision instead of a new guide.
                  </p>
                )}
                {draft.securityReviewRequired && (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl border border-status-warning/40 bg-status-warning/10 p-3 text-sm font-semibold">
                    <ShieldCheck
                      className="mt-0.5 h-4 w-4 shrink-0 text-status-warning"
                      aria-hidden
                    />
                    Security review required: one or more steps need IT approval
                    or specialist handling.
                  </p>
                )}
                {draft.failureReason && (
                  <p className="mt-3 flex items-start gap-2 rounded-2xl border border-status-danger/40 bg-status-danger/10 p-3 text-sm font-semibold">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-status-danger"
                      aria-hidden
                    />
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
                            <span className="ml-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-extrabold text-muted-foreground">
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
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
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
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
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
                        <XCircle className="h-3.5 w-3.5" aria-hidden />
                        Reject
                      </Button>
                    </div>
                    {open === "revision" && (
                      <form
                        className="hf-swap grid gap-2 rounded-2xl border border-border bg-muted/30 p-3"
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
                          className="text-sm font-bold"
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
                          className={INPUT}
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
                          className={`${INPUT} min-h-16`}
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
                        className="hf-swap grid gap-2 rounded-2xl border border-border bg-muted/30 p-3"
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
                          className="text-sm font-bold"
                          htmlFor={`title-${draft.id}`}
                        >
                          Title
                        </label>
                        <input
                          id={`title-${draft.id}`}
                          name="title"
                          data-draft-id={draft.id}
                          defaultValue={article.title}
                          className={INPUT}
                        />
                        <label
                          className="text-sm font-bold"
                          htmlFor={`root-${draft.id}`}
                        >
                          Root cause
                        </label>
                        <textarea
                          id={`root-${draft.id}`}
                          name="rootCause"
                          data-draft-id={draft.id}
                          defaultValue={article.rootCause}
                          className={`${INPUT} min-h-16`}
                        />
                        <label
                          className="text-sm font-bold"
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
                          className={`${INPUT} min-h-24`}
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
                        className="hf-swap grid gap-2 rounded-2xl border border-border bg-muted/30 p-3"
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
                          className="text-sm font-bold"
                          htmlFor={`instructions-${draft.id}`}
                        >
                          Reviewer instructions
                        </label>
                        <textarea
                          id={`instructions-${draft.id}`}
                          name="instructions"
                          data-draft-id={draft.id}
                          required
                          className={`${INPUT} min-h-16`}
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
                        className="hf-swap grid gap-2 rounded-2xl border border-border bg-muted/30 p-3"
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
                          className="text-sm font-bold"
                          htmlFor={`reason-${draft.id}`}
                        >
                          Rejection reason (required)
                        </label>
                        <textarea
                          id={`reason-${draft.id}`}
                          name="reason"
                          data-draft-id={draft.id}
                          required
                          className={`${INPUT} min-h-16`}
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
    </AdminPanel>
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
    <div className="mt-3 rounded-2xl border border-border bg-muted/30 p-3 text-sm">
      <strong className="font-extrabold">Review history:</strong>
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
