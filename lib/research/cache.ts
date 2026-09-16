import type { createAdminClient } from "@/lib/supabase/admin";
import type {
  ResearchSource,
  ResearchProviderId,
  ResearchResult,
} from "./types";

type CacheRow = { response: ResearchSource[]; expires_at: string };

export async function getCached(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  provider: ResearchProviderId,
  queryHash: string
): Promise<ResearchSource[] | null> {
  const result = await admin
    .from("research_cache")
    .select("response,expires_at")
    .eq("organization_id", organizationId)
    .eq("provider", provider)
    .eq("query_hash", queryHash)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data as CacheRow;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  return Array.isArray(row.response) ? row.response : null;
}

export async function putCached(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  provider: ResearchProviderId,
  queryHash: string,
  sources: ResearchSource[],
  ttlHours: number
): Promise<void> {
  await admin.from("research_cache").upsert({
    organization_id: organizationId,
    provider,
    query_hash: queryHash,
    response: sources,
    fetched_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + ttlHours * 3_600_000).toISOString(),
  });
}

export type ResearchCacheResult = ResearchResult<ResearchSource[]>;
