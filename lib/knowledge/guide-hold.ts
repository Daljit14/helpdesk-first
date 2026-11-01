import { getKnowledgeGuideHoldMode } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";

const HOLD_PAGE_SIZE = 1000;

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
    held = new Set();
    const admin = createAdminClient();
    for (let from = 0; ; from += HOLD_PAGE_SIZE) {
      const { data, error } = await admin
        .from("knowledge_health_findings")
        .select("guide_slug,kind,severity")
        .eq("organization_id", orgId)
        .eq("status", "open")
        .in("guide_slug", slugs)
        .or("severity.eq.critical,kind.eq.guide_reported_wrong")
        .order("id")
        .range(from, from + HOLD_PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data ?? []) as HoldRow[];
      for (const row of rows) {
        if (row.guide_slug && isHoldWorthy(row)) held.add(row.guide_slug);
      }
      if (rows.length < HOLD_PAGE_SIZE) break;
    }
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
