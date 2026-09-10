import { createHash } from "node:crypto";
import { z } from "zod";
import { getAllIssueSlugs, getIssueBySlug } from "@/lib/search";
import { ISSUES } from "@/lib/issues";
import { createAdminClient } from "@/lib/supabase/admin";
import { isKnowledgeLearningEnabled } from "@/lib/admin/flags";
import { scrubLearningText } from "@/lib/tickets/scrub";
import { evaluateLearningEligibility } from "@/lib/knowledge/learning-eligibility";
import {
  mergeRedactionSummaries,
  redactForLearning,
  type RedactionSummary,
} from "@/lib/knowledge/learning-redaction";
import {
  findSimilarGuides,
  validateLearnedArticle,
  type LearnedArticle,
} from "@/lib/knowledge/learning-article";
import {
  getLearnedArticleProvider,
  type LearnedArticleInput,
} from "@/lib/knowledge/learning-provider";

export type KnowledgeDraftContent = {
  symptoms: string[];
  rootCause: string;
  resolutionSteps: string[];
  preventive: string | null;
  toolsUsed: string | null;
  platform: string | null;
  attemptedGuide: { slug: string; failedSteps: number[] } | null;
};

export type KnowledgeDraftKind = "new_guide" | "guide_update";
export type KnowledgeDraftStatus =
  | "queued"
  | "generating"
  | "draft"
  | "needs_security_review"
  | "approved"
  | "rejected"
  | "published"
  | "failed";

export const REVIEWABLE_STATUSES: KnowledgeDraftStatus[] = [
  "draft",
  "needs_security_review",
];
export const LEARNING_DISCARD_RETENTION_DAYS = 30;
const MAX_EVENT_ATTEMPTS = 3;

export type KnowledgeDraft = {
  id: string;
  organizationId: string;
  ticketId: string;
  kind: KnowledgeDraftKind;
  relatedSlug: string | null;
  title: string;
  content: KnowledgeDraftContent;
  article: LearnedArticle | null;
  confirmation: "user_confirmed" | "verification_exception";
  status: KnowledgeDraftStatus;
  reviewNote: string | null;
  rejectionReason: string | null;
  reviewerInstructions: string | null;
  regenerationCount: number;
  securityReviewRequired: boolean;
  failureReason: string | null;
  redactionSummary: RedactionSummary;
  similarSlugs: string[];
  modelProvider: string | null;
  modelVersion: string | null;
  promptVersion: string | null;
  generatedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdGuideId: string | null;
  publishedRevisionId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeDraftInputs = {
  ticket: {
    id: string;
    message: string | null;
    issue_id: string | null;
    issue_title: string | null;
    platform: string | null;
    ai_recommended_issue_id: string | null;
    diagnostic_answers: { questionId: string; answer: string }[] | null;
    resolution_report: unknown;
    verification_method: string | null;
    verification_exception: boolean | null;
  };
  stepOutcomes: {
    guide_slug: string;
    step_index: number;
    outcome: string;
  }[];
  approvedSlugs: string[];
};

const resolutionReportSchema = z
  .object({
    rootCause: z.string(),
    actionsPerformed: z.string(),
    toolsUsed: z.string(),
    preventiveRecommendation: z.string(),
  })
  .passthrough();

function firstSentence(value: string): string {
  return value.split(/[.!?](?:\s|$)/, 1)[0]?.trim() ?? value;
}

function splitResolutionSteps(value: string): string[] {
  return value
    .split(/\r?\n|\d+[.)]\s|;|\. +/)
    .map((step) => step.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean)
    .map((step) => scrubLearningText(step, 300))
    .filter(Boolean)
    .slice(0, 10);
}

function uniqueSymptoms(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => scrubLearningText(value, 200))
    .filter((value) => {
      if (!value || seen.has(value.toLowerCase())) return false;
      seen.add(value.toLowerCase());
      return true;
    })
    .slice(0, 6);
}

export function buildKnowledgeDraft(inputs: KnowledgeDraftInputs): {
  kind: KnowledgeDraftKind;
  relatedSlug: string | null;
  title: string;
  content: KnowledgeDraftContent;
  confirmation: "user_confirmed" | "verification_exception";
} | null {
  const report = resolutionReportSchema.safeParse(
    inputs.ticket.resolution_report
  );
  if (!report.success) return null;
  const relatedSlug =
    [inputs.ticket.issue_id, inputs.ticket.ai_recommended_issue_id].find(
      (slug): slug is string =>
        typeof slug === "string" && inputs.approvedSlugs.includes(slug)
    ) ?? null;
  const kind: KnowledgeDraftKind = relatedSlug ? "guide_update" : "new_guide";
  const rootCause = scrubLearningText(report.data.rootCause, 1000);
  const symptoms = uniqueSymptoms([
    ...(inputs.ticket.message ? [inputs.ticket.message] : []),
    ...(inputs.ticket.diagnostic_answers ?? []).map(({ answer }) => answer),
  ]);
  const resolutionSteps = splitResolutionSteps(report.data.actionsPerformed);
  const failedSteps = relatedSlug
    ? [
        ...new Set(
          inputs.stepOutcomes
            .filter(
              (outcome) =>
                outcome.guide_slug === relatedSlug &&
                ["failed", "could_not_perform"].includes(outcome.outcome)
            )
            .map(({ step_index }) => step_index)
        ),
      ].sort((a, b) => a - b)
    : [];
  const content: KnowledgeDraftContent = {
    symptoms,
    rootCause,
    resolutionSteps,
    preventive:
      scrubLearningText(report.data.preventiveRecommendation, 1000) || null,
    toolsUsed: scrubLearningText(report.data.toolsUsed, 300) || null,
    platform: inputs.ticket.platform,
    attemptedGuide: relatedSlug ? { slug: relatedSlug, failedSteps } : null,
  };
  return {
    kind,
    relatedSlug,
    title:
      kind === "guide_update"
        ? `Update: ${inputs.ticket.issue_title ?? relatedSlug}`.slice(0, 160)
        : `New guide: ${firstSentence(rootCause)}`.slice(0, 160),
    content,
    confirmation:
      inputs.ticket.verification_method === "user_confirmed" &&
      !inputs.ticket.verification_exception
        ? "user_confirmed"
        : "verification_exception",
  };
}

export function hashResolution(
  organizationId: string,
  ticketId: string,
  report: unknown
): string {
  return createHash("sha256")
    .update(JSON.stringify([organizationId, ticketId, report ?? null]))
    .digest("hex");
}

/**
 * Builds the redacted provider input. Only structured resolution data is used;
 * internal notes, attachments and the raw conversation are never included.
 */
export function buildLearnedArticleInput(
  inputs: KnowledgeDraftInputs,
  reviewerInstructions: string | null
): { input: LearnedArticleInput; redactions: RedactionSummary } | null {
  const report = resolutionReportSchema.safeParse(
    inputs.ticket.resolution_report
  );
  if (!report.success) return null;
  const draft = buildKnowledgeDraft(inputs);
  if (!draft) return null;
  const problem = redactForLearning(inputs.ticket.message ?? "", 600);
  const symptoms = [
    ...(inputs.ticket.message ? [inputs.ticket.message] : []),
    ...(inputs.ticket.diagnostic_answers ?? []).map(({ answer }) => answer),
  ].map((value) => redactForLearning(value, 300));
  const rootCause = redactForLearning(report.data.rootCause, 600);
  const actions = redactForLearning(report.data.actionsPerformed, 3000);
  const tools = redactForLearning(report.data.toolsUsed, 300);
  const preventive = redactForLearning(report.data.preventiveRecommendation, 600);
  const seen = new Set<string>();
  const uniqueSymptomText = symptoms
    .map(({ text }) => text)
    .filter((text) => {
      const key = text.toLowerCase();
      if (!text || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
  return {
    input: {
      ticketId: inputs.ticket.id,
      problem: problem.text || uniqueSymptomText[0] || rootCause.text,
      symptoms: uniqueSymptomText.length ? uniqueSymptomText : [rootCause.text],
      platform: inputs.ticket.platform,
      relatedSlug: draft.relatedSlug,
      relatedTitle: draft.relatedSlug
        ? (getIssueBySlug(draft.relatedSlug)?.title ?? inputs.ticket.issue_title)
        : null,
      rootCause: rootCause.text,
      actionsPerformed: actions.text,
      toolsUsed: tools.text,
      preventive: preventive.text,
      failedGuideSteps: draft.content.attemptedGuide?.failedSteps ?? [],
      reviewerInstructions,
    },
    redactions: mergeRedactionSummaries(
      problem.summary,
      ...symptoms.map(({ summary }) => summary),
      rootCause.summary,
      actions.summary,
      tools.summary,
      preventive.summary
    ),
  };
}

type LearningAdminClient = ReturnType<typeof createAdminClient>;

type DraftRow = {
  id: string;
  organization_id: string;
  ticket_id: string;
  kind: KnowledgeDraftKind;
  related_slug: string | null;
  title: string;
  content: KnowledgeDraftContent;
  article: LearnedArticle | null;
  confirmation: "user_confirmed" | "verification_exception";
  status: KnowledgeDraftStatus;
  review_note: string | null;
  rejection_reason: string | null;
  reviewer_instructions: string | null;
  regeneration_count: number | null;
  security_review_required: boolean | null;
  failure_reason: string | null;
  redaction_summary: RedactionSummary | null;
  similar_slugs: string[] | null;
  model_provider: string | null;
  model_version: string | null;
  prompt_version: string | null;
  generated_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_guide_id: string | null;
  published_revision_id: number | null;
  created_at: string;
  updated_at: string;
};

function mapDraft(row: DraftRow): KnowledgeDraft {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ticketId: row.ticket_id,
    kind: row.kind,
    relatedSlug: row.related_slug,
    title: row.title,
    content: row.content,
    article: row.article ?? null,
    confirmation: row.confirmation,
    status: row.status,
    reviewNote: row.review_note,
    rejectionReason: row.rejection_reason ?? null,
    reviewerInstructions: row.reviewer_instructions ?? null,
    regenerationCount: row.regeneration_count ?? 0,
    securityReviewRequired: row.security_review_required ?? false,
    failureReason: row.failure_reason ?? null,
    redactionSummary: row.redaction_summary ?? {},
    similarSlugs: row.similar_slugs ?? [],
    modelProvider: row.model_provider ?? null,
    modelVersion: row.model_version ?? null,
    promptVersion: row.prompt_version ?? null,
    generatedAt: row.generated_at ?? null,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdGuideId: row.created_guide_id,
    publishedRevisionId: row.published_revision_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type TicketRow = KnowledgeDraftInputs["ticket"] & {
  status: string;
  reopen_count: number | null;
  verified_by_user: boolean | null;
};

const ticketSelect =
  "id,message,issue_id,issue_title,platform,ai_recommended_issue_id,diagnostic_answers,resolution_report,verification_method,verification_exception,status,reopen_count,verified_by_user";

export type GenerationOutcome =
  | { kind: "created"; status: KnowledgeDraftStatus }
  | { kind: "duplicate" }
  | { kind: "skipped"; reason: string }
  | { kind: "review"; reason: string };

/**
 * Produces the candidate columns for a ticket. Pure with respect to the
 * database apart from reads; the caller persists the result.
 */
export async function generateCandidate(
  admin: LearningAdminClient,
  ticketId: string,
  organizationId: string,
  options: { reviewerInstructions?: string | null } = {}
): Promise<
  | { outcome: Exclude<GenerationOutcome, { kind: "created" }> }
  | {
      outcome: { kind: "created"; status: KnowledgeDraftStatus };
      row: Record<string, unknown>;
      provider: string;
    }
> {
  const ticketResult = await admin
    .from("tickets")
    .select(ticketSelect)
    .eq("id", ticketId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (ticketResult.error) throw ticketResult.error;
  const ticket = ticketResult.data as TicketRow | null;
  if (!ticket) return { outcome: { kind: "skipped", reason: "ticket_missing" } };

  const report = resolutionReportSchema.safeParse(ticket.resolution_report);
  const eligibility = evaluateLearningEligibility({
    status: ticket.status,
    reopenCount: ticket.reopen_count,
    verificationMethod: ticket.verification_method,
    verificationException: ticket.verification_exception,
    verifiedByUser: ticket.verified_by_user,
    resolutionReport: ticket.resolution_report,
    textForScreening: [
      ticket.message ?? "",
      ticket.issue_title ?? "",
      ...(ticket.diagnostic_answers ?? []).map(({ answer }) => answer),
      ...(report.success
        ? [
            report.data.rootCause,
            report.data.actionsPerformed,
            report.data.toolsUsed,
            report.data.preventiveRecommendation,
          ]
        : []),
    ],
  });
  if (!eligibility.eligible) {
    const reason = eligibility.detail
      ? `${eligibility.reason}: ${eligibility.detail}`
      : eligibility.reason;
    return {
      outcome: eligibility.manualReview
        ? { kind: "review", reason }
        : { kind: "skipped", reason },
    };
  }

  const outcomes = await admin
    .from("ticket_step_outcomes")
    .select("guide_slug,step_index,outcome")
    .eq("ticket_id", ticketId)
    .eq("organization_id", organizationId);
  if (outcomes.error) throw outcomes.error;

  const inputs: KnowledgeDraftInputs = {
    ticket,
    stepOutcomes: (outcomes.data ?? []) as KnowledgeDraftInputs["stepOutcomes"],
    approvedSlugs: getAllIssueSlugs(),
  };
  const draft = buildKnowledgeDraft(inputs);
  const prepared = buildLearnedArticleInput(
    inputs,
    options.reviewerInstructions ?? null
  );
  if (!draft || !prepared) {
    return { outcome: { kind: "skipped", reason: "incomplete_report" } };
  }

  const provider = getLearnedArticleProvider();
  const generatedAt = new Date().toISOString();
  let raw: unknown;
  try {
    raw = await provider.generate(prepared.input);
  } catch (error) {
    throw new Error(
      `provider_failed: ${error instanceof Error ? error.message : "unknown"}`
    );
  }
  const validation = validateLearnedArticle(raw, inputs.approvedSlugs);
  const status: KnowledgeDraftStatus = !validation.ok
    ? "failed"
    : validation.securityReviewRequired
      ? "needs_security_review"
      : "draft";
  const similar = validation.article
    ? findSimilarGuides(validation.article, ISSUES)
    : [];

  return {
    outcome: { kind: "created", status },
    provider: provider.name,
    row: {
      organization_id: organizationId,
      ticket_id: ticketId,
      kind: draft.kind,
      related_slug: draft.relatedSlug,
      title: validation.article?.title.slice(0, 160) ?? draft.title,
      content: draft.content,
      article: validation.ok ? validation.article : null,
      confirmation: draft.confirmation,
      status,
      source_resolution_hash: hashResolution(
        organizationId,
        ticketId,
        ticket.resolution_report
      ),
      redaction_summary: prepared.redactions,
      similar_slugs: similar.map(({ slug }) => slug),
      model_provider: provider.name,
      model_version: provider.version,
      prompt_version: provider.promptVersion,
      generated_at: generatedAt,
      security_review_required: validation.securityReviewRequired,
      failure_reason: validation.ok
        ? null
        : validation.errors.join("; ").slice(0, 500),
      reviewer_instructions: options.reviewerInstructions ?? null,
    },
  };
}

type LearningEvent = {
  id: string;
  ticket_id: string;
  organization_id: string;
  attempts: number;
};

export async function enqueueLearningEvent(
  admin: LearningAdminClient,
  ticketId: string,
  organizationId: string
): Promise<LearningEvent | null> {
  const { data, error } = await admin
    .from("knowledge_learning_events")
    .upsert(
      { organization_id: organizationId, ticket_id: ticketId },
      { onConflict: "ticket_id", ignoreDuplicates: true }
    )
    .select("id,ticket_id,organization_id,attempts")
    .maybeSingle();
  if (error) throw error;
  return (data as LearningEvent | null) ?? null;
}

export async function processLearningEvent(
  admin: LearningAdminClient,
  event: LearningEvent
): Promise<GenerationOutcome | { kind: "retry" | "failed"; error: string }> {
  const attempts = event.attempts + 1;
  const startedAt = Date.now();
  await admin
    .from("knowledge_learning_events")
    .update({ status: "processing", attempts })
    .eq("id", event.id);
  try {
    const generated = await generateCandidate(
      admin,
      event.ticket_id,
      event.organization_id
    );
    let outcome: GenerationOutcome = generated.outcome;
    if (generated.outcome.kind === "created" && "row" in generated) {
      const inserted = await admin
        .from("knowledge_drafts")
        .upsert(generated.row, {
          onConflict: "ticket_id",
          ignoreDuplicates: true,
        })
        .select("id")
        .maybeSingle();
      if (inserted.error) throw inserted.error;
      if (!inserted.data) outcome = { kind: "duplicate" };
    }
    const status =
      outcome.kind === "created" || outcome.kind === "duplicate"
        ? "done"
        : outcome.kind === "review"
          ? "review"
          : "skipped";
    await admin
      .from("knowledge_learning_events")
      .update({
        status,
        last_error: "reason" in outcome ? outcome.reason.slice(0, 500) : null,
        provider: "provider" in generated ? generated.provider : null,
        latency_ms: Date.now() - startedAt,
        cost_usd: 0,
        processed_at: new Date().toISOString(),
      })
      .eq("id", event.id);
    return outcome;
  } catch (error) {
    const message = (
      error instanceof Error ? error.message : "unknown error"
    ).slice(0, 500);
    const exhausted = attempts >= MAX_EVENT_ATTEMPTS;
    await admin
      .from("knowledge_learning_events")
      .update({
        status: exhausted ? "review" : "pending",
        last_error: message,
        latency_ms: Date.now() - startedAt,
        processed_at: exhausted ? new Date().toISOString() : null,
      })
      .eq("id", event.id);
    return { kind: exhausted ? "failed" : "retry", error: message };
  }
}

/**
 * Called when a ticket reaches a verified resolution. Never throws and never
 * blocks the resolution: it records one learning event and attempts to
 * process it immediately; the cron worker retries anything left pending.
 */
export async function createKnowledgeDraftForTicket(
  admin: LearningAdminClient,
  ticketId: string,
  organizationId: string
): Promise<void> {
  if (!isKnowledgeLearningEnabled()) return;
  try {
    const event = await enqueueLearningEvent(admin, ticketId, organizationId);
    if (event) await processLearningEvent(admin, event);
  } catch {
    console.warn("knowledge learning event not recorded");
  }
}

export async function processPendingLearningEvents(
  admin: LearningAdminClient,
  limit = 25
): Promise<{ processed: number; created: number; retried: number }> {
  const { data, error } = await admin
    .from("knowledge_learning_events")
    .select("id,ticket_id,organization_id,attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const summary = { processed: 0, created: 0, retried: 0 };
  for (const event of (data ?? []) as LearningEvent[]) {
    const outcome = await processLearningEvent(admin, event);
    summary.processed += 1;
    if (outcome.kind === "created") summary.created += 1;
    if (outcome.kind === "retry") summary.retried += 1;
  }
  return summary;
}

export async function listKnowledgeDrafts(
  organizationId: string,
  status?: KnowledgeDraftStatus
): Promise<KnowledgeDraft[]> {
  if (!isKnowledgeLearningEnabled()) return [];
  let query = createAdminClient()
    .from("knowledge_drafts")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as DraftRow[]).map(mapDraft);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "guide"
  );
}

export type DraftDecision =
  | { decision: "approve_new"; note?: string }
  | { decision: "approve_revision"; targetSlug: string; note?: string }
  | { decision: "security_review"; note?: string }
  | { decision: "reject"; reason: string }
  | { decision: "regenerate"; instructions: string }
  | {
      decision: "edit";
      edits: {
        title?: string;
        rootCause?: string;
        symptoms?: string[];
        steps?: string[];
      };
    }
  | { decision: "discard" };

export type ReviewResult = { success: true } | { error: string };

const editableStatuses = new Set<KnowledgeDraftStatus>(REVIEWABLE_STATUSES);

export async function reviewKnowledgeDraft(
  input: {
    draftId: string;
    organizationId: string;
    actorId: string;
  } & DraftDecision
): Promise<ReviewResult> {
  if (!isKnowledgeLearningEnabled()) return { error: "Not available." };
  const admin = createAdminClient();
  const found = await admin
    .from("knowledge_drafts")
    .select("*")
    .eq("id", input.draftId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (found.error || !found.data) return { error: "Draft not found." };
  const draft = mapDraft(found.data as DraftRow);
  const now = new Date().toISOString();
  const reviewed = { reviewed_by: input.actorId, reviewed_at: now, updated_at: now };

  async function update(
    patch: Record<string, unknown>,
    fromStatuses: KnowledgeDraftStatus[]
  ): Promise<ReviewResult> {
    const result = await admin
      .from("knowledge_drafts")
      .update(patch)
      .eq("id", input.draftId)
      .eq("organization_id", input.organizationId)
      .in("status", fromStatuses)
      .select("id")
      .maybeSingle();
    if (result.error || !result.data) {
      return { error: "Draft not found or already reviewed." };
    }
    return { success: true };
  }

  switch (input.decision) {
    case "discard": {
      const ageMs = Date.now() - new Date(draft.updatedAt).getTime();
      if (
        !["rejected", "failed"].includes(draft.status) ||
        ageMs < LEARNING_DISCARD_RETENTION_DAYS * 86_400_000
      ) {
        return {
          error: `Only rejected or failed drafts older than ${LEARNING_DISCARD_RETENTION_DAYS} days can be discarded.`,
        };
      }
      const result = await admin
        .from("knowledge_drafts")
        .delete()
        .eq("id", input.draftId)
        .eq("organization_id", input.organizationId)
        .in("status", ["rejected", "failed"]);
      return result.error ? { error: "Unable to discard draft." } : { success: true };
    }
    case "reject": {
      const reason = input.reason.trim();
      if (!reason) return { error: "A rejection reason is required." };
      if (!editableStatuses.has(draft.status)) {
        return { error: "Draft not found or already reviewed." };
      }
      return update(
        { status: "rejected", rejection_reason: reason.slice(0, 1000), ...reviewed },
        REVIEWABLE_STATUSES
      );
    }
    case "security_review": {
      if (draft.status !== "draft") {
        return { error: "Draft not found or already reviewed." };
      }
      return update(
        {
          status: "needs_security_review",
          security_review_required: true,
          review_note: input.note?.trim() || null,
          updated_at: now,
        },
        ["draft"]
      );
    }
    case "edit": {
      if (!editableStatuses.has(draft.status) || !draft.article) {
        return { error: "Draft cannot be edited." };
      }
      const merged: LearnedArticle = {
        ...draft.article,
        title: input.edits.title?.trim() || draft.article.title,
        rootCause: input.edits.rootCause?.trim() || draft.article.rootCause,
        symptoms: input.edits.symptoms?.length
          ? input.edits.symptoms
          : draft.article.symptoms,
        steps: input.edits.steps?.length
          ? input.edits.steps.map((text) => ({ text, risk: "safe" as const }))
          : draft.article.steps,
      };
      const validation = validateLearnedArticle(merged, getAllIssueSlugs());
      if (!validation.ok || !validation.article) {
        return { error: `Edit rejected: ${validation.errors.join("; ")}`.slice(0, 300) };
      }
      return update(
        {
          title: validation.article.title.slice(0, 160),
          article: validation.article,
          security_review_required: validation.securityReviewRequired,
          status: validation.securityReviewRequired
            ? "needs_security_review"
            : draft.status,
          updated_at: now,
        },
        REVIEWABLE_STATUSES
      );
    }
    case "regenerate": {
      if (!editableStatuses.has(draft.status) && draft.status !== "failed") {
        return { error: "Draft not found or already reviewed." };
      }
      if (draft.regenerationCount >= 1) {
        return { error: "This draft has already been regenerated once." };
      }
      const instructions = input.instructions.trim().slice(0, 1000);
      if (!instructions) return { error: "Reviewer instructions are required." };
      const generated = await generateCandidate(
        admin,
        draft.ticketId,
        input.organizationId,
        { reviewerInstructions: instructions }
      );
      if (generated.outcome.kind !== "created" || !("row" in generated)) {
        return { error: "The source ticket is no longer eligible for learning." };
      }
      const {
        organization_id: _org,
        ticket_id: _ticket,
        source_resolution_hash: _hash,
        ...patch
      } = generated.row;
      void _org;
      void _ticket;
      void _hash;
      return update(
        { ...patch, regeneration_count: 1, updated_at: now },
        [...REVIEWABLE_STATUSES, "failed"]
      );
    }
    case "approve_new": {
      if (!editableStatuses.has(draft.status) || !draft.article) {
        return { error: "Draft not found or already reviewed." };
      }
      const slug = `learned-${slugify(draft.title)}-${draft.id.slice(0, 8)}`;
      const guide = await admin
        .from("knowledge_guides")
        .insert({
          organization_id: input.organizationId,
          slug,
          title: draft.title.slice(0, 160),
          status: "draft",
          version: 1,
          source_title: `Learned from ticket ${draft.ticketId}`,
          source_url: null,
          source_owner: null,
          retrieved_at: now,
          supported_platforms: draft.article.platforms,
          risk_tier: draft.securityReviewRequired ? "medium" : "low",
        })
        .select("id")
        .single();
      if (guide.error || !guide.data) return { error: "Unable to create guide." };
      const revision = await admin
        .from("knowledge_guide_revisions")
        .insert({
          guide_id: guide.data.id,
          organization_id: input.organizationId,
          actor_id: input.actorId,
          from_status: "draft",
          to_status: "draft",
          version: 1,
          note: `Created from learning draft ${draft.id}`,
          prior_snapshot: { learningDraftId: draft.id, article: draft.article },
        })
        .select("id")
        .single();
      return update(
        {
          status: "approved",
          review_note: input.note?.trim() || null,
          created_guide_id: guide.data.id,
          published_revision_id: revision.data?.id ?? null,
          ...reviewed,
        },
        REVIEWABLE_STATUSES
      );
    }
    case "approve_revision": {
      if (!editableStatuses.has(draft.status) || !draft.article) {
        return { error: "Draft not found or already reviewed." };
      }
      const targetSlug = input.targetSlug.trim();
      const guideResult = await admin
        .from("knowledge_guides")
        .select("*")
        .eq("slug", targetSlug)
        .or(`organization_id.is.null,organization_id.eq.${input.organizationId}`)
        .order("organization_id", { ascending: false, nullsFirst: false })
        .limit(1);
      const guide = guideResult.data?.[0] as
        | { id: string; status: string; version: number; organization_id: string | null }
        | undefined;
      if (guideResult.error || !guide) return { error: "Target guide not found." };
      const revision = await admin
        .from("knowledge_guide_revisions")
        .insert({
          guide_id: guide.id,
          organization_id: input.organizationId,
          actor_id: input.actorId,
          from_status: guide.status,
          to_status: guide.status,
          version: guide.version,
          note: `Proposed revision from learning draft ${draft.id}${
            input.note?.trim() ? `: ${input.note.trim()}` : ""
          }`.slice(0, 1000),
          prior_snapshot: { guide, learningDraftId: draft.id, article: draft.article },
        })
        .select("id")
        .single();
      if (revision.error || !revision.data) {
        return { error: "Unable to record guide revision." };
      }
      return update(
        {
          status: "approved",
          kind: "guide_update",
          related_slug: targetSlug,
          review_note: input.note?.trim() || null,
          created_guide_id: guide.id,
          published_revision_id: revision.data.id,
          ...reviewed,
        },
        REVIEWABLE_STATUSES
      );
    }
  }
}
