import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const checks: Record<string, { ok: boolean; ms: number | null }> = {
    app: { ok: true, ms: 0 },
  };

  if (isSupabaseConfigured()) {
    const start = Date.now();
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("guide_rating_totals")
        .select("issue_id", { head: true, count: "exact" })
        .limit(1);
      checks.database = { ok: !error, ms: Date.now() - start };
    } catch {
      checks.database = { ok: false, ms: Date.now() - start };
    }
  } else {
    checks.database = { ok: false, ms: null };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return Response.json(
    { ok: allOk, checks, timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
