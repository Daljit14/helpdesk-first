import { getKnowledgeGuideHoldMode } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";

type HoldRow = { guide_slug: string | null; kind: string; severity: string };

export function isHoldWorthy(row: Pick<HoldRow, "kind" | "severity">) {
  return row.severity === "critical" || row.kind === "guide_reported_wrong";
}

export async function applyGuideHold(
  orgId: string | null,
  slugs: string[]
): Promise<string[]> {
  const mode = getKnowledgeGuideHoldMode();
  if (mode === "off" || !orgId || slugs.length === 0) return slugs;
  let held: Set<string>;
  try {
    const { data, error } = await createAdminClient()
      .from("knowledge_health_findings")
      .select("guide_slug,kind,severity")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .not("guide_slug", "is", null)
      .limit(1000);
    if (error) throw error;
    held = new Set(
      ((data ?? []) as HoldRow[])
        .filter(isHoldWorthy)
        .map((row) => row.guide_slug as string)
    );
  } catch {
    console.warn(
      JSON.stringify({
        event: "knowledge.guide_hold.error",
        organizationId: orgId,
      })
    );
    return slugs;
  }
  const wouldHold = slugs.filter((slug) => held.has(slug));
  if (wouldHold.length === 0) return slugs;
  console.info(
    JSON.stringify({
      event: `knowledge.guide_hold.${mode}`,
      organizationId: orgId,
      slugs: wouldHold,
    })
  );
  return mode === "enforce" ? slugs.filter((slug) => !held.has(slug)) : slugs;
}
