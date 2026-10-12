import { createHash } from "node:crypto";
import { z } from "zod";
import { getAllIssueSlugs, getIssueBySlug } from "@/lib/search";
import { ISSUES } from "@/lib/issues";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRecordExcluded } from "@/lib/admin/record-exclusions";
import { isSessionTainted } from "@/lib/agent/taint";
import { decryptTicketRow } from "@/lib/security/ticket-crypto";
import {
  isKnowledgeCaptureEnabled,
  isKnowledgeLearningEnabled,
} from "@/lib/admin/flags";
import { scrubLearningText } from "@/lib/tickets/scrub";
import {
  evaluateAgentSessionEligibility,
  evaluateLearningEligibility,
} from "@/lib/knowledge/learning-eligibility";
import {
  mergeRedactionSummaries,
  redactForLearning,
  type RedactionSummary,
} from "@/lib/knowledge/learning-redaction";
import {
  findSimilarGuides,
  tokenize,
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
  | "clustered"
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
  clusterId: string | null;
  sourceKind: "ticket" | "agent_session" | "answer_run";
  agentSessionId: string | null;
};

export type KnowledgeDraftCluster = {
  id: string;
  organizationId: string;
  clusterKey: string;
  platform: string;
  title: string;
  tokens: string[];
  memberCount: number;
  answerFixedCount: number;
  primaryDraftId: string;
  status: "open" | "closed";
  lastSeenAt: string;
  createdAt: string;
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
    [
      typeof (inputs.ticket.resolution_report as Record<string, unknown> | null)
        ?.helpedGuideSlug === "string" &&
      (inputs.ticket.resolution_report as Record<string, unknown>)
        .guideWasWrong === true
        ? ((inputs.ticket.resolution_report as Record<string, unknown>)
            .helpedGuideSlug as string)
        : null,
      inputs.ticket.issue_id,
      inputs.ticket.ai_recommended_issue_id,
    ].find(
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

export function clusterTokens(platform: string, text: string): string[] {
  return [...new Set(tokenize(`${platform} ${text}`))].sort();
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / union.size;
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
  const preventive = redactForLearning(
    report.data.preventiveRecommendation,
    600
  );
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
        ? (getIssueBySlug(draft.relatedSlug)?.title ??
          inputs.ticket.issue_title)
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
  cluster_id: string | null;
  source_kind?: "ticket" | "agent_session" | "answer_run" | null;
  agent_session_id?: string | null;
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
    clusterId: row.cluster_id ?? null,
    sourceKind: row.source_kind ?? "ticket",
    agentSessionId: row.agent_session_id ?? null,
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
  options: {
    reviewerInstructions?: string | null;
    sourceKind?: "ticket" | "agent_session" | "answer_run";
    agentSessionId?: string | null;
  } = {}
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
  const ticket = ticketResult.data
    ? await decryptTicketRow(admin, {
        ...(ticketResult.data as TicketRow),
        organization_id: organizationId,
      })
    : null;
  if (!ticket)
    return { outcome: { kind: "skipped", reason: "ticket_missing" } };
  if (await isRecordExcluded(admin, organizationId, "tickets", ticketId))
    return { outcome: { kind: "skipped", reason: "excluded_record" } };

  if (options.sourceKind === "agent_session") {
    if (!options.agentSessionId)
      return { outcome: { kind: "skipped", reason: "session_not_confirmed" } };
    const sessionResult = await admin
      .from("agent_sessions")
      .select("id,status,user_confirmed_at,security_flag,resolution_run_id")
      .eq("id", options.agentSessionId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (sessionResult.error) throw sessionResult.error;
    if (!sessionResult.data)
      return { outcome: { kind: "skipped", reason: "session_not_confirmed" } };
    const runId = sessionResult.data.resolution_run_id;
    const [verification, steps] = await Promise.all([
      runId
        ? admin
            .from("verification_results")
            .select("outcome")
            .eq("organization_id", organizationId)
            .eq("run_id", runId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin
        .from("agent_steps")
        .select("policy_decision")
        .eq("session_id", options.agentSessionId),
    ]);
    if (verification.error) throw verification.error;
    if (steps.error) throw steps.error;
    const sessionEligibility = evaluateAgentSessionEligibility({
      status: sessionResult.data.status,
      userConfirmedAt: sessionResult.data.user_confirmed_at,
      latestVerificationOutcome: verification.data?.outcome ?? null,
      securityFlag: sessionResult.data.security_flag === true,
      tainted: isSessionTainted(
        (steps.data ?? []).map((row) =>
          typeof row.policy_decision === "string" ? row.policy_decision : null
        )
      ),
      backingTicketReopenCount: ticket.reopen_count,
    });
    if (!sessionEligibility.eligible) {
      return {
        outcome: { kind: "skipped", reason: sessionEligibility.reason },
      };
    }
  }

  const report = resolutionReportSchema.safeParse(ticket.resolution_report);
  const eligibility = evaluateLearningEligibility({
    status: options.sourceKind === "agent_session" ? "Resolved" : ticket.status,
    reopenCount: ticket.reopen_count,
    verificationMethod:
      options.sourceKind === "agent_session"
        ? "user_confirmed"
        : ticket.verification_method,
    verificationException:
      options.sourceKind === "agent_session"
        ? false
        : ticket.verification_exception,
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
    ticket:
      options.sourceKind === "agent_session"
        ? {
            ...ticket,
            verification_method: "user_confirmed",
            verification_exception: false,
          }
        : ticket,
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
      ...(options.sourceKind === "agent_session" ||
      options.sourceKind === "answer_run"
        ? {
            source_kind: options.sourceKind,
            ...(options.sourceKind === "agent_session"
              ? { agent_session_id: options.agentSessionId ?? null }
              : {}),
          }
        : {}),
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
  source_kind?: "ticket" | "agent_session" | "answer_run";
  agent_session_id?: string | null;
};

type LearningEventQueryResult = {
  data: LearningEvent | null;
  error: { code?: string; message?: string } | null;
};

export async function enqueueLearningEvent(
  admin: LearningAdminClient,
  ticketId: string,
  organizationId: string,
  source: {
    sourceKind?: "ticket" | "agent_session" | "answer_run";
    agentSessionId?: string | null;
  } = {}
): Promise<LearningEvent | null> {
  const sourceKind = source.sourceKind ?? "ticket";
  const usesCaptureSource = sourceKind !== "ticket";
  const captureEnabled = isKnowledgeCaptureEnabled();
  const captureSchema = captureEnabled || usesCaptureSource;
  const payload = {
    organization_id: organizationId,
    ticket_id: ticketId,
  };
  const request = captureSchema
    ? (() => {
        const query = admin.from("knowledge_learning_events");
        const capturePayload = {
          ...payload,
          source_kind: sourceKind,
          agent_session_id:
            sourceKind === "agent_session"
              ? (source.agentSessionId ?? null)
              : null,
        };
        return sourceKind === "agent_session"
          ? query.insert(capturePayload)
          : query.upsert(capturePayload, {
              onConflict: "ticket_id,source_kind",
              ignoreDuplicates: true,
            });
      })()
    : admin.from("knowledge_learning_events").upsert(payload, {
        onConflict: "ticket_id",
        ignoreDuplicates: true,
      });
  let { data, error } = (await request
    .select(
      captureSchema
        ? "id,ticket_id,organization_id,attempts,source_kind,agent_session_id"
        : "id,ticket_id,organization_id,attempts"
    )
    .maybeSingle()) as unknown as LearningEventQueryResult;
  if (error && !captureEnabled && !usesCaptureSource) {
    const fallback = (await admin
      .from("knowledge_learning_events")
      .upsert(
        { ...payload, source_kind: "ticket", agent_session_id: null },
        {
          onConflict: "ticket_id,source_kind",
          ignoreDuplicates: true,
        }
      )
      .select(
        "id,ticket_id,organization_id,attempts,source_kind,agent_session_id"
      )
      .maybeSingle()) as unknown as LearningEventQueryResult;
    data = fallback.data;
    error = fallback.error;
  }
  if (error?.code === "23505" && source.sourceKind === "agent_session") {
    return null;
  }
  if (error) throw error;
  return (data as LearningEvent | null) ?? null;
}

type ClusterRow = {
  id: string;
  organization_id: string;
  cluster_key: string;
  platform: string;
  title: string;
  tokens: string[];
  member_count: number;
  answer_fixed_count: number;
  primary_draft_id: string;
  status: "open" | "closed";
  last_seen_at: string;
  created_at: string;
};

export async function listOpenKnowledgeClustersForCapture(
  admin: LearningAdminClient,
  organizationId: string,
  platform: string
): Promise<ClusterRow[]> {
  const result = await admin
    .from("knowledge_draft_clusters")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("platform", platform)
    .eq("status", "open")
    .order("last_seen_at", { ascending: false })
    .limit(500);
  if (result.error) throw result.error;
  return ((result.data ?? []) as ClusterRow[]).filter(
    (row) =>
      row.organization_id === organizationId &&
      row.platform === platform &&
      row.status === "open"
  );
}

function bestCluster(
  clusters: ClusterRow[],
  tokens: string[]
): ClusterRow | null {
  let best: ClusterRow | null = null;
  let bestScore = 0.6;
  for (const cluster of clusters) {
    const score = jaccard(tokens, cluster.tokens ?? []);
    if (score >= bestScore) {
      best = cluster;
      bestScore = score;
    }
  }
  return best;
}

export async function bumpOpenKnowledgeClusterForAnswer(
  admin: LearningAdminClient,
  organizationId: string,
  platform: string,
  problemLabel: string
): Promise<boolean> {
  const tokens = clusterTokens(platform, problemLabel);
  const cluster = bestCluster(
    await listOpenKnowledgeClustersForCapture(admin, organizationId, platform),
    tokens
  );
  if (!cluster) return false;
  const result = await admin
    .from("knowledge_draft_clusters")
    .update({
      answer_fixed_count: (cluster.answer_fixed_count ?? 0) + 1,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", cluster.id)
    .eq("organization_id", organizationId)
    .eq("status", "open");
  if (result.error) throw result.error;
  return true;
}

async function persistClusterForCandidate(
  admin: LearningAdminClient,
  organizationId: string,
  row: Record<string, unknown>,
  draftId: string
): Promise<void> {
  const content = row.content as KnowledgeDraftContent;
  const article = row.article as LearnedArticle | null;
  const platform = content.platform ?? article?.platforms[0] ?? "Any";
  const text = [
    String(row.title ?? ""),
    article?.problemSummary ?? "",
    content.rootCause,
    ...content.symptoms,
  ].join(" ");
  const tokens = clusterTokens(platform, text);
  const cluster = bestCluster(
    await listOpenKnowledgeClustersForCapture(admin, organizationId, platform),
    tokens
  );
  if (cluster) {
    const updated = await admin
      .from("knowledge_draft_clusters")
      .update({
        member_count: (cluster.member_count ?? 1) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", cluster.id)
      .eq("organization_id", organizationId)
      .eq("status", "open");
    if (updated.error) throw updated.error;
    const attached = await admin
      .from("knowledge_drafts")
      .update({
        cluster_id: cluster.id,
        status:
          row.status === "needs_security_review"
            ? "needs_security_review"
            : "clustered",
      })
      .eq("id", draftId)
      .eq("organization_id", organizationId);
    if (attached.error) throw attached.error;
    return;
  }

  const clusterKey = createHash("sha256")
    .update(JSON.stringify([platform, tokens]))
    .digest("hex");
  const created = await admin
    .from("knowledge_draft_clusters")
    .insert({
      organization_id: organizationId,
      cluster_key: clusterKey,
      platform,
      title: String(row.title ?? "").slice(0, 160),
      tokens,
      member_count: 1,
      answer_fixed_count: 0,
      primary_draft_id: draftId,
      status: "open",
      last_seen_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (created.error) throw created.error;
  const attached = await admin
    .from("knowledge_drafts")
    .update({ cluster_id: created.data?.id ?? null })
    .eq("id", draftId)
    .eq("organization_id", organizationId);
  if (attached.error) throw attached.error;
}

export async function processLearningEvent(
  admin: LearningAdminClient,
  event: LearningEvent
): Promise<GenerationOutcome | { kind: "retry" | "failed"; error: string }> {
  const attempts = event.attempts + 1;
  const startedAt = Date.now();
  const captureEnabled = isKnowledgeCaptureEnabled();
  await admin
    .from("knowledge_learning_events")
    .update({ status: "processing", attempts })
    .eq("id", event.id);
  try {
    const generated =
      !captureEnabled && event.source_kind === "agent_session"
        ? {
            outcome: {
              kind: "skipped" as const,
              reason: "knowledge_capture_disabled",
            },
          }
        : await generateCandidate(
            admin,
            event.ticket_id,
            event.organization_id,
            {
              sourceKind: captureEnabled
                ? (event.source_kind ?? "ticket")
                : "ticket",
              agentSessionId: captureEnabled
                ? event.agent_session_id
                : undefined,
            }
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
      if (!inserted.data) {
        outcome = { kind: "duplicate" };
      } else if (isKnowledgeCaptureEnabled()) {
        await persistClusterForCandidate(
          admin,
          event.organization_id,
          generated.row,
          inserted.data.id
        );
      }
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
  organizationId: string,
  source: {
    sourceKind?: "ticket" | "agent_session" | "answer_run";
    agentSessionId?: string | null;
  } = {}
): Promise<void> {
  if (!isKnowledgeLearningEnabled()) return;
  try {
    const event = await enqueueLearningEvent(
      admin,
      ticketId,
      organizationId,
      source
    );
    if (event) await processLearningEvent(admin, event);
  } catch {
    console.warn("knowledge learning event not recorded");
  }
}

export async function processPendingLearningEvents(
  admin: LearningAdminClient,
  limit = 25
): Promise<{ processed: number; created: number; retried: number }> {
  const captureEnabled = isKnowledgeCaptureEnabled();
  const selectEvents = async (columns: string) =>
    (await admin
      .from("knowledge_learning_events")
      .select(columns)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit)) as unknown as {
      data: unknown[] | null;
      error: { code?: string; message?: string } | null;
    };
  let result = await selectEvents(
    "id,ticket_id,organization_id,attempts,source_kind,agent_session_id"
  );
  if (result.error && !captureEnabled) {
    result = await selectEvents("id,ticket_id,organization_id,attempts");
  }
  if (result.error) throw result.error;
  const summary = { processed: 0, created: 0, retried: 0 };
  for (const event of (result.data ?? []) as unknown as LearningEvent[]) {
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

export async function listKnowledgeDraftClusters(
  organizationId: string
): Promise<KnowledgeDraftCluster[]> {
  if (!isKnowledgeCaptureEnabled()) return [];
  const { data, error } = await createAdminClient()
    .from("knowledge_draft_clusters")
    .select("*")
    .eq("organization_id", organizationId)
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as ClusterRow[]).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    clusterKey: row.cluster_key,
    platform: row.platform,
    title: row.title,
    tokens: row.tokens ?? [],
    memberCount: row.member_count,
    answerFixedCount: row.answer_fixed_count,
    primaryDraftId: row.primary_draft_id,
    status: row.status,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  }));
}

export async function splitKnowledgeDraftMember(
  organizationId: string,
  draftId: string
): Promise<{ success: true } | { error: string }> {
  if (!isKnowledgeCaptureEnabled()) return { error: "Not available." };
  const admin = createAdminClient();
  const draftResult = await admin
    .from("knowledge_drafts")
    .select("id,cluster_id,status")
    .eq("id", draftId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (draftResult.error || !draftResult.data?.cluster_id) {
    return { error: "Cluster member not found." };
  }
  const clusterResult = await admin
    .from("knowledge_draft_clusters")
    .select("id,primary_draft_id,member_count")
    .eq("id", draftResult.data.cluster_id)
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .maybeSingle();
  if (
    clusterResult.error ||
    !clusterResult.data ||
    clusterResult.data.primary_draft_id === draftId
  ) {
    return { error: "Only a non-primary cluster member can be split." };
  }
  const detached = await admin
    .from("knowledge_drafts")
    .update({
      cluster_id: null,
      status:
        draftResult.data.status === "needs_security_review"
          ? "needs_security_review"
          : "draft",
    })
    .eq("id", draftId)
    .eq("organization_id", organizationId)
    .eq("cluster_id", draftResult.data.cluster_id)
    .select("id")
    .maybeSingle();
  if (detached.error || !detached.data) {
    return { error: "Unable to split cluster member." };
  }
  const updated = await admin
    .from("knowledge_draft_clusters")
    .update({
      member_count: Math.max(1, clusterResult.data.member_count - 1),
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", draftResult.data.cluster_id)
    .eq("organization_id", organizationId)
    .eq("status", "open");
  return updated.error
    ? { error: "Unable to update cluster." }
    : { success: true };
}

export async function closeKnowledgeDraftClusterForGuide(
  admin: LearningAdminClient,
  organizationId: string,
  guideId: string
): Promise<void> {
  const draft = await admin
    .from("knowledge_drafts")
    .select("id,cluster_id")
    .eq("organization_id", organizationId)
    .eq("created_guide_id", guideId)
    .eq("status", "approved")
    .maybeSingle();
  if (draft.error || !draft.data?.cluster_id) return;
  await admin
    .from("knowledge_draft_clusters")
    .update({ status: "closed", last_seen_at: new Date().toISOString() })
    .eq("id", draft.data.cluster_id)
    .eq("organization_id", organizationId)
    .eq("primary_draft_id", draft.data.id)
    .eq("status", "open");
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
  const reviewed = {
    reviewed_by: input.actorId,
    reviewed_at: now,
    updated_at: now,
  };

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
      return result.error
        ? { error: "Unable to discard draft." }
        : { success: true };
    }
    case "reject": {
      const reason = input.reason.trim();
      if (!reason) return { error: "A rejection reason is required." };
      if (!editableStatuses.has(draft.status)) {
        return { error: "Draft not found or already reviewed." };
      }
      const rejected = await update(
        {
          status: "rejected",
          rejection_reason: reason.slice(0, 1000),
          ...reviewed,
        },
        REVIEWABLE_STATUSES
      );
      if ("error" in rejected || !draft.clusterId) return rejected;
      const cluster = await admin
        .from("knowledge_draft_clusters")
        .select("id,primary_draft_id")
        .eq("id", draft.clusterId)
        .eq("organization_id", input.organizationId)
        .eq("status", "open")
        .maybeSingle();
      if (!cluster.error && cluster.data?.primary_draft_id === draft.id) {
        const newest = await admin
          .from("knowledge_drafts")
          .select("id,status")
          .eq("cluster_id", draft.clusterId)
          .eq("organization_id", input.organizationId)
          .neq("id", draft.id)
          .in("status", ["clustered", ...REVIEWABLE_STATUSES])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!newest.error && newest.data) {
          await admin
            .from("knowledge_drafts")
            .update({
              status:
                newest.data.status === "needs_security_review"
                  ? "needs_security_review"
                  : "draft",
            })
            .eq("id", newest.data.id)
            .eq("organization_id", input.organizationId);
          await admin
            .from("knowledge_draft_clusters")
            .update({ primary_draft_id: newest.data.id })
            .eq("id", draft.clusterId)
            .eq("organization_id", input.organizationId)
            .eq("status", "open");
        }
      }
      return rejected;
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
        return {
          error: `Edit rejected: ${validation.errors.join("; ")}`.slice(0, 300),
        };
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
      if (!instructions)
        return { error: "Reviewer instructions are required." };
      const generated = await generateCandidate(
        admin,
        draft.ticketId,
        input.organizationId,
        {
          reviewerInstructions: instructions,
          sourceKind: draft.sourceKind,
          agentSessionId: draft.agentSessionId,
        }
      );
      if (generated.outcome.kind !== "created" || !("row" in generated)) {
        return {
          error: "The source ticket is no longer eligible for learning.",
        };
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
      return update({ ...patch, regeneration_count: 1, updated_at: now }, [
        ...REVIEWABLE_STATUSES,
        "failed",
      ]);
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
      if (guide.error || !guide.data)
        return { error: "Unable to create guide." };
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
        .or(
          `organization_id.is.null,organization_id.eq.${input.organizationId}`
        )
        .order("organization_id", { ascending: false, nullsFirst: false })
        .limit(1);
      const guide = guideResult.data?.[0] as
        | {
            id: string;
            status: string;
            version: number;
            organization_id: string | null;
          }
        | undefined;
      if (guideResult.error || !guide)
        return { error: "Target guide not found." };
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
          prior_snapshot: {
            guide,
            learningDraftId: draft.id,
            article: draft.article,
          },
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
