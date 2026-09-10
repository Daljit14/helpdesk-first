import { timingSafeEqual } from "node:crypto";
import { isKnowledgeHealthEnabled } from "@/lib/admin/flags";
import { runKnowledgeHealthScan } from "@/lib/knowledge/health";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function matchesSecret(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  if (!matchesSecret(supplied, process.env.CRON_SECRET)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isKnowledgeHealthEnabled()) {
    return Response.json(
      { skipped: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  try {
    const { data, error } = await createAdminClient()
      .from("organizations")
      .select("id")
      .order("id");
    if (error) throw error;
    const results = [];
    for (const organization of data ?? []) {
      results.push({
        organizationId: organization.id,
        ...(await runKnowledgeHealthScan(organization.id)),
      });
    }
    return Response.json(
      { results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("knowledge health scan failed", error);
    return Response.json(
      { error: "Knowledge health scan failed." },
      { status: 500 }
    );
  }
}
