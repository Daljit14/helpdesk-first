import { isKnowledgeFreshnessEnabled } from "@/lib/admin/flags";
import { listGuides, type KnowledgeGuide } from "@/lib/knowledge/governance";
import type { KnowledgeHealthFinding } from "@/lib/knowledge/health";
import { redactForLearning } from "@/lib/knowledge/learning-redaction";
import { createAdminClient } from "@/lib/supabase/admin";

export const REVIEW_INTERVAL_DAYS = 180;
export const DUE_SOON_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const FINDING_PENALTY: Record<string, number> = {
  critical: 40,
  warning: 20,
  info: 5,
};

export type FreshnessState =
  "fresh" | "due_soon" | "overdue" | "expired" | "at_risk";

export type GuideFreshness = {
  slug: string;
  title: string;
  score: number;
  state: FreshnessState;
  reviewDueAt: string | null;
  lastVerifiedAt: string | null;
  openFindings: number;
  reasons: string[];
};

type FreshnessGuide = Pick<
  KnowledgeGuide,
  "slug" | "title" | "retrievedAt" | "expiresAt" | "createdAt"
>;
type FreshnessFinding = Pick<
  KnowledgeHealthFinding,
  "guideSlug" | "kind" | "severity" | "status"
>;

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function computeGuideFreshness(
  guide: FreshnessGuide,
  findings: FreshnessFinding[],
  lastVerifiedAt: string | null,
  now: Date
): GuideFreshness {
  const nowMs = now.getTime();
  const reviewedMs = [toMs(lastVerifiedAt), toMs(guide.retrievedAt)].filter(
    (value): value is number => value !== null
  );
  const baseMs = reviewedMs.length
    ? Math.max(...reviewedMs)
    : toMs(guide.createdAt);
  const expiresMs = toMs(guide.expiresAt);
  const dueCandidates = [
    baseMs === null ? null : baseMs + REVIEW_INTERVAL_DAYS * DAY_MS,
    expiresMs,
  ].filter((value): value is number => value !== null);
  const dueMs = dueCandidates.length ? Math.min(...dueCandidates) : null;

  let score = 100;
  const reasons: string[] = [];
  const expired = expiresMs !== null && expiresMs <= nowMs;
  if (expired) {
    score -= 50;
    reasons.push("The guide has passed its expiry date.");
  } else if (dueMs === null) {
    score -= 20;
    reasons.push("No source or review date is recorded.");
  } else if (dueMs <= nowMs) {
    score -= 30;
    reasons.push("The scheduled review is overdue.");
  } else if (dueMs - nowMs <= DUE_SOON_DAYS * DAY_MS) {
    score -= 10;
    reasons.push("The scheduled review is due soon.");
  }

  const open = findings.filter(
    (finding) => finding.guideSlug === guide.slug && finding.status === "open"
  );
  for (const finding of open) {
    score -= FINDING_PENALTY[finding.severity] ?? 0;
    reasons.push(
      `Open ${finding.severity} health finding: ${finding.kind.replace(/_/g, " ")}.`
    );
  }
  score = Math.max(0, Math.min(100, score));

  const hasCritical = open.some((finding) => finding.severity === "critical");
  const state: FreshnessState = expired
    ? "expired"
    : hasCritical || score < 50
      ? "at_risk"
      : dueMs !== null && dueMs <= nowMs
        ? "overdue"
        : reasons.length > 0
          ? "due_soon"
          : "fresh";

  return {
    slug: guide.slug,
    title: guide.title,
    score,
    state,
    reviewDueAt: dueMs === null ? null : new Date(dueMs).toISOString(),
    lastVerifiedAt,
    openFindings: open.length,
    reasons,
  };
}

export async function listGuideFreshness(
  orgId: string,
  findings: FreshnessFinding[],
  now: Date = new Date()
): Promise<GuideFreshness[]> {
  if (!isKnowledgeFreshnessEnabled()) return [];
  const [guides, verifications] = await Promise.all([
    listGuides(orgId, { status: "approved" }),
    createAdminClient()
      .from("knowledge_guide_verifications")
      .select("guide_slug,verified_at")
      .eq("organization_id", orgId)
      .order("verified_at", { ascending: false })
      .limit(2000),
  ]);
  if (verifications.error) throw verifications.error;
  const lastVerified = new Map<string, string>();
  for (const row of (verifications.data ?? []) as Array<{
    guide_slug: string;
    verified_at: string;
  }>) {
    if (!lastVerified.has(row.guide_slug)) {
      lastVerified.set(row.guide_slug, row.verified_at);
    }
  }
  return guides
    .map((guide) =>
      computeGuideFreshness(
        guide,
        findings,
        lastVerified.get(guide.slug) ?? null,
        now
      )
    )
    .sort((a, b) => a.score - b.score || a.slug.localeCompare(b.slug));
}

export async function verifyGuide(input: {
  orgId: string;
  guideSlug: string;
  actorId: string;
  note?: string | null;
}): Promise<{ success: true } | { error: string }> {
  if (!isKnowledgeFreshnessEnabled()) return { error: "Not available." };
  const admin = createAdminClient();
  const guide = await admin
    .from("knowledge_guides")
    .select("slug")
    .eq("slug", input.guideSlug)
    .eq("status", "approved")
    .or(`organization_id.is.null,organization_id.eq.${input.orgId}`)
    .limit(1);
  if (guide.error || !guide.data?.length) return { error: "Guide not found." };
  const note = input.note?.trim()
    ? redactForLearning(input.note.trim(), 500).text
    : null;
  const verifiedAt = new Date().toISOString();
  const inserted = await admin.from("knowledge_guide_verifications").insert({
    organization_id: input.orgId,
    guide_slug: input.guideSlug,
    verified_by: input.actorId,
    note,
    verified_at: verifiedAt,
  });
  if (inserted.error) return { error: "Could not record the review." };
  await admin
    .from("knowledge_health_findings")
    .update({
      status: "acknowledged",
      reviewed_by: input.actorId,
      reviewed_at: verifiedAt,
    })
    .eq("organization_id", input.orgId)
    .eq("guide_slug", input.guideSlug)
    .eq("kind", "outdated")
    .eq("severity", "warning")
    .eq("status", "open");
  return { success: true };
}
