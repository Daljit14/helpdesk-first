import { z } from "zod";
import { getAllIssueSlugs } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { isKnowledgeLearningEnabled } from "@/lib/admin/flags";
import { scrubLearningText } from "@/lib/tickets/scrub";

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
export type KnowledgeDraftStatus = "draft" | "approved" | "rejected";

export type KnowledgeDraft = {
  id: string;
  organizationId: string;
  ticketId: string;
  kind: KnowledgeDraftKind;
  relatedSlug: string | null;
  title: string;
  content: KnowledgeDraftContent;
  confirmation: "user_confirmed" | "verification_exception";
  status: KnowledgeDraftStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdGuideId: string | null;
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

type LearningAdminClient = ReturnType<typeof createAdminClient>;
type DraftRow = Omit<KnowledgeDraft, never> & {
  organization_id: string;
  ticket_id: string;
  related_slug: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_guide_id: string | null;
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
    confirmation: row.confirmation,
    status: row.status,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdGuideId: row.created_guide_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createKnowledgeDraftForTicket(
  admin: LearningAdminClient,
  ticketId: string,
  organizationId: string
): Promise<void> {
  if (!isKnowledgeLearningEnabled()) return;
  try {
    const ticketResult = await admin
      .from("tickets")
      .select(
        "id,message,issue_id,issue_title,platform,ai_recommended_issue_id,diagnostic_answers,resolution_report,verification_method,verification_exception,status"
      )
      .eq("id", ticketId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    const ticket = ticketResult.data as KnowledgeDraftInputs["ticket"] & {
      status: string;
    };
    if (
      ticketResult.error ||
      !ticket ||
      ticket.status !== "Resolved" ||
      ticket.resolution_report == null
    ) {
      return;
    }
    const outcomes = await admin
      .from("ticket_step_outcomes")
      .select("guide_slug,step_index,outcome")
      .eq("ticket_id", ticketId)
      .eq("organization_id", organizationId);
    if (outcomes.error) throw outcomes.error;
    const draft = buildKnowledgeDraft({
      ticket,
      stepOutcomes: (outcomes.data ??
        []) as KnowledgeDraftInputs["stepOutcomes"],
      approvedSlugs: getAllIssueSlugs(),
    });
    if (!draft) return;
    const result = await admin.from("knowledge_drafts").upsert(
      {
        organization_id: organizationId,
        ticket_id: ticketId,
        kind: draft.kind,
        related_slug: draft.relatedSlug,
        title: draft.title,
        content: draft.content,
        confirmation: draft.confirmation,
      },
      { onConflict: "ticket_id", ignoreDuplicates: true }
    );
    if (result.error) throw result.error;
  } catch {
    console.warn("knowledge draft not created");
  }
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

export async function reviewKnowledgeDraft(input: {
  draftId: string;
  organizationId: string;
  actorId: string;
  status: "approved" | "rejected";
  note?: string;
}): Promise<{ success: true } | { error: string }> {
  if (!isKnowledgeLearningEnabled()) return { error: "Not available." };
  const admin = createAdminClient();
  const found = await admin
    .from("knowledge_drafts")
    .select("*")
    .eq("id", input.draftId)
    .eq("organization_id", input.organizationId)
    .eq("status", "draft")
    .maybeSingle();
  if (found.error || !found.data) {
    return { error: "Draft not found or already reviewed." };
  }
  const draft = mapDraft(found.data as DraftRow);
  let createdGuideId: string | null = null;
  if (input.status === "approved" && draft.kind === "new_guide") {
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
        retrieved_at: new Date().toISOString(),
        supported_platforms: draft.content.platform
          ? [draft.content.platform]
          : [],
        risk_tier: "low",
      })
      .select("id")
      .single();
    if (guide.error || !guide.data) return { error: "Unable to create guide." };
    createdGuideId = guide.data.id;
  }
  const updated = await admin
    .from("knowledge_drafts")
    .update({
      status: input.status,
      review_note: input.note?.trim() || null,
      reviewed_by: input.actorId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_guide_id: createdGuideId,
    })
    .eq("id", input.draftId)
    .eq("organization_id", input.organizationId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data)
    return { error: "Unable to review draft." };
  return { success: true };
}
