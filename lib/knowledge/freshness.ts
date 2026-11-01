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

const PAGE_SIZE = 1000;

type EffectiveCandidate = Pick<
  KnowledgeGuide,
  "organizationId" | "slug" | "status"
>;

// Mirrors approved_guide_slugs: an approved org row overrides the global row,
// a retired org row hides it, and any other org status leaves the global row.
export function resolveEffectiveGuides<T extends EffectiveCandidate>(
  guides: T[]
): T[] {
  const bySlug = new Map<string, { global?: T; org?: T }>();
  for (const guide of guides) {
    const entry = bySlug.get(guide.slug) ?? {};
    if (guide.organizationId) entry.org = guide;
    else entry.global = guide;
    bySlug.set(guide.slug, entry);
  }
  const effective: T[] = [];
  for (const { global, org } of bySlug.values()) {
    if (org?.status === "approved") effective.push(org);
    else if (org?.status !== "retired" && global?.status === "approved") {
      effective.push(global);
    }
  }
  return effective;
}

async function readPages<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown; error: unknown }>,
  done: (batch: T[]) => boolean = () => false
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    const finished = done(batch);
    if (finished || batch.length < PAGE_SIZE) return rows;
  }
}

const reviewKey = (guideId: string, version: number) => `${guideId}:${version}`;

export async function listGuideFreshness(
  orgId: string,
  now: Date = new Date()
): Promise<GuideFreshness[]> {
  if (!isKnowledgeFreshnessEnabled()) return [];
  const admin = createAdminClient();
  const guides = resolveEffectiveGuides(await listGuides(orgId));
  const wanted = new Set(guides.map((g) => reviewKey(g.id, g.version)));
  const lastVerified = new Map<string, string>();
  const [findingRows] = await Promise.all([
    readPages<{ guide_slug: string; kind: string; severity: string }>(
      (from, to) =>
        admin
          .from("knowledge_health_findings")
          .select("guide_slug,kind,severity")
          .eq("organization_id", orgId)
          .eq("status", "open")
          .not("guide_slug", "is", null)
          .order("id")
          .range(from, to)
    ),
    wanted.size === 0
      ? Promise.resolve([])
      : readPages<{
          guide_id: string;
          guide_version: number;
          verified_at: string;
        }>(
          (from, to) =>
            admin
              .from("knowledge_guide_verifications")
              .select("guide_id,guide_version,verified_at")
              .eq("organization_id", orgId)
              .order("verified_at", { ascending: false })
              .order("id")
              .range(from, to),
          (rows) => {
            for (const row of rows) {
              const key = reviewKey(row.guide_id, row.guide_version);
              if (wanted.has(key) && !lastVerified.has(key)) {
                lastVerified.set(key, row.verified_at);
              }
            }
            return lastVerified.size === wanted.size;
          }
        ),
  ]);
  const findings: FreshnessFinding[] = findingRows.map((row) => ({
    guideSlug: row.guide_slug,
    kind: row.kind,
    severity: row.severity,
    status: "open",
  }));
  return guides
    .map((guide) =>
      computeGuideFreshness(
        guide,
        findings,
        lastVerified.get(reviewKey(guide.id, guide.version)) ?? null,
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
  const candidates = await admin
    .from("knowledge_guides")
    .select("id,organization_id,slug,status,version")
    .eq("slug", input.guideSlug)
    .or(`organization_id.is.null,organization_id.eq.${input.orgId}`);
  if (candidates.error) return { error: "Guide not found." };
  const [guide] = resolveEffectiveGuides(
    (
      (candidates.data ?? []) as Array<{
        id: string;
        organization_id: string | null;
        slug: string;
        status: KnowledgeGuide["status"];
        version: number;
      }>
    ).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      slug: row.slug,
      status: row.status,
      version: row.version,
    }))
  );
  if (!guide) return { error: "Guide not found." };
  const note = input.note?.trim()
    ? redactForLearning(input.note.trim(), 500).text
    : null;
  const verifiedAt = new Date().toISOString();
  const inserted = await admin.from("knowledge_guide_verifications").insert({
    organization_id: input.orgId,
    guide_id: guide.id,
    guide_version: guide.version,
    guide_slug: guide.slug,
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
