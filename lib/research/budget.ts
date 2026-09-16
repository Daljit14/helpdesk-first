import type { createAdminClient } from "@/lib/supabase/admin";

export async function checkAndConsumeOrgResearchBudget(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  limit: number
): Promise<boolean> {
  if (limit === 0) return false;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const result = await admin
    .from("research_queries")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("cached", false)
    .gte("created_at", start.toISOString());
  if (result.error) return false;
  return (result.data?.length ?? 0) < limit;
}
