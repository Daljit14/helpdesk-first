import { timingSafeEqual } from "node:crypto";
import { isServiceHealthEnabled } from "@/lib/admin/flags";
import { notifyRestoredOutages } from "@/lib/service-health/restore";
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
  if (!isServiceHealthEnabled()) {
    return Response.json(
      { skipped: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  try {
    const result = await notifyRestoredOutages(createAdminClient());
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("service health restoration failed", error);
    return Response.json(
      { error: "Service health restoration failed." },
      { status: 500 }
    );
  }
}
