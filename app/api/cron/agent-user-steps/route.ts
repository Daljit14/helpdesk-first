import { timingSafeEqual } from "node:crypto";
import { isAgentUserStepsEnabled } from "@/lib/admin/flags";
import { sweepPendingUserSteps } from "@/lib/agent/user-steps-sweep";
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
  if (!isAgentUserStepsEnabled()) {
    return Response.json(
      { skipped: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  try {
    const result = await sweepPendingUserSteps(createAdminClient());
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("user step sweep failed", error);
    return Response.json({ error: "User step sweep failed." }, { status: 500 });
  }
}
