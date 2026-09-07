import { getAllIssueSlugs } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";

export type GuideStatus = "draft" | "in_review" | "approved" | "retired";

export type KnowledgeGuide = {
  id: string;
  organizationId: string | null;
  slug: string;
  title: string;
  status: GuideStatus;
  version: number;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceOwner: string | null;
  reviewer: string | null;
  retrievedAt: string | null;
  expiresAt: string | null;
  supportedPlatforms: string[];
  riskTier: string;
  createdAt: string;
  updatedAt: string;
};

export type Citation = {
  title: string;
  url: string | null;
  retrievedAt: string | null;
  version: number;
  supportedPlatforms: string[];
  riskTier: string;
};

type GuideRow = {
  id: string;
  organization_id: string | null;
  slug: string;
  title: string;
  status: GuideStatus;
  version: number;
  source_title: string | null;
  source_url: string | null;
  source_owner: string | null;
  reviewer: string | null;
  retrieved_at: string | null;
  expires_at: string | null;
  supported_platforms: string[] | null;
  risk_tier: string;
  created_at: string;
  updated_at: string;
};

function isGovernanceEnabled(): boolean {
  return process.env.HELP_DESK_KNOWLEDGE_GOVERNANCE_ENABLED === "true";
}

function mapGuide(row: GuideRow): KnowledgeGuide {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    version: row.version,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    sourceOwner: row.source_owner,
    reviewer: row.reviewer,
    retrievedAt: row.retrieved_at,
    expiresAt: row.expires_at,
    supportedPlatforms: row.supported_platforms ?? [],
    riskTier: row.risk_tier,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getApprovedSlugs(
  orgId: string | null
): Promise<string[]> {
  if (!isGovernanceEnabled()) return getAllIssueSlugs();
  const { data, error } = await createAdminClient().rpc(
    "approved_guide_slugs",
    { org: orgId }
  );
  if (error) throw error;
  return ((data ?? []) as (string | { approved_guide_slugs: string })[]).map(
    (row) => (typeof row === "string" ? row : row.approved_guide_slugs)
  );
}

export async function listGuides(
  orgId: string | null,
  filter?: { status?: GuideStatus; q?: string }
): Promise<KnowledgeGuide[]> {
  if (!isGovernanceEnabled()) return [];
  let query = createAdminClient()
    .from("knowledge_guides")
    .select("*")
    .order("title");
  query = orgId
    ? query.or(`organization_id.is.null,organization_id.eq.${orgId}`)
    : query.is("organization_id", null);
  if (filter?.status) query = query.eq("status", filter.status);
  if (filter?.q?.trim()) {
    const q = filter.q.trim().replace(/[%_]/g, "");
    query = query.or(`title.ilike.%${q}%,slug.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as GuideRow[]).map(mapGuide);
}

const transitions: Record<GuideStatus, GuideStatus[]> = {
  draft: ["in_review"],
  in_review: ["approved", "draft"],
  approved: ["retired"],
  retired: ["draft"],
};

export async function transitionGuide(input: {
  guideId: string;
  to: GuideStatus;
  actorId: string;
  note?: string;
  reviewer?: string;
}): Promise<{ error: string } | { success: true }> {
  if (!isGovernanceEnabled()) return { error: "Not available." };
  const admin = createAdminClient();
  const { data: current, error: fetchError } = await admin
    .from("knowledge_guides")
    .select("*")
    .eq("id", input.guideId)
    .maybeSingle();
  if (fetchError || !current) return { error: "Guide not found." };
  const row = current as GuideRow;
  if (!transitions[row.status].includes(input.to)) {
    return { error: "That guide transition is not allowed." };
  }
  if (input.to === "approved" && !input.reviewer?.trim()) {
    return { error: "A reviewer is required to approve a guide." };
  }
  const snapshot = { ...row };
  const { error: revisionError } = await admin
    .from("knowledge_guide_revisions")
    .insert({
      guide_id: row.id,
      organization_id: row.organization_id,
      actor_id: input.actorId,
      from_status: row.status,
      to_status: input.to,
      version: row.version,
      note: input.note?.trim() || null,
      prior_snapshot: snapshot,
    });
  if (revisionError) return { error: "Unable to record guide history." };
  const { error } = await admin
    .from("knowledge_guides")
    .update({
      status: input.to,
      reviewer: input.to === "approved" ? input.reviewer?.trim() : row.reviewer,
      version: input.to === "approved" ? row.version + 1 : row.version,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) return { error: "Unable to update guide." };
  return { success: true };
}

export async function updateGuideMetadata(input: {
  guideId: string;
  sourceUrl?: string;
  sourceOwner?: string;
  expiresAt?: string;
  riskTier?: string;
  supportedPlatforms?: string[];
}): Promise<{ error: string } | { success: true }> {
  if (!isGovernanceEnabled()) return { error: "Not available." };
  const admin = createAdminClient();
  const { data: current, error: fetchError } = await admin
    .from("knowledge_guides")
    .select("*")
    .eq("id", input.guideId)
    .maybeSingle();
  if (fetchError || !current) return { error: "Guide not found." };
  const row = current as GuideRow;
  const { error: revisionError } = await admin
    .from("knowledge_guide_revisions")
    .insert({
      guide_id: row.id,
      organization_id: row.organization_id,
      actor_id: null,
      from_status: row.status,
      to_status: row.status,
      version: row.version,
      note: "Metadata updated",
      prior_snapshot: row,
    });
  if (revisionError) return { error: "Unable to record guide history." };
  const { error } = await admin
    .from("knowledge_guides")
    .update({
      source_url: input.sourceUrl,
      source_owner: input.sourceOwner,
      expires_at: input.expiresAt || null,
      risk_tier: input.riskTier,
      supported_platforms: input.supportedPlatforms,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) return { error: "Unable to update guide metadata." };
  return { success: true };
}

export async function getCitation(
  slug: string,
  orgId: string | null
): Promise<Citation | null> {
  if (!isGovernanceEnabled()) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("approved_guide_slugs", {
    org: orgId,
  });
  if (error) throw error;
  const approved = (
    (data ?? []) as (string | { approved_guide_slugs: string })[]
  ).some((row) =>
    typeof row === "string" ? row === slug : row.approved_guide_slugs === slug
  );
  if (!approved) return null;
  const scopedQuery = orgId
    ? admin
        .from("knowledge_guides")
        .select("*")
        .eq("slug", slug)
        .in("status", ["approved"])
        .or(`organization_id.is.null,organization_id.eq.${orgId}`)
        .order("organization_id", { ascending: false, nullsFirst: false })
        .limit(1)
    : admin
        .from("knowledge_guides")
        .select("*")
        .eq("slug", slug)
        .in("status", ["approved"])
        .is("organization_id", null)
        .limit(1);
  const { data: scopedRows, error: scopedError } = await scopedQuery;
  if (scopedError || !scopedRows?.[0]) return null;
  const guide = mapGuide(scopedRows[0] as GuideRow);
  return {
    title: guide.sourceTitle ?? guide.title,
    url: guide.sourceUrl,
    retrievedAt: guide.retrievedAt,
    version: guide.version,
    supportedPlatforms: guide.supportedPlatforms,
    riskTier: guide.riskTier,
  };
}
