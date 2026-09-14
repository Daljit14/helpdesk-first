import { timingSafeEqual } from "node:crypto";
import { isCapabilityRegistryEnabled } from "@/lib/admin/flags";
import { syncCapabilityRegistry } from "@/lib/autonomy/capabilities/sync";
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
  if (!isCapabilityRegistryEnabled()) {
    return Response.json(
      { skipped: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  try {
    const admin = createAdminClient();
    const result = await syncCapabilityRegistry(admin);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("capability registry sync failed", error);
    return Response.json(
      { error: "Capability registry sync failed." },
      { status: 500 }
    );
  }
}
