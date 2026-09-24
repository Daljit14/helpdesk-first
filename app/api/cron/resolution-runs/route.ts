import { timingSafeEqual } from "node:crypto";
import { isAutonomyEnabled } from "@/lib/autonomy/config";
import { processDueRuns, reapExpiredLeases } from "@/lib/autonomy/orchestrator";
import { createAdminClient } from "@/lib/supabase/admin";
import { reclaimExpiredDeviceJobs } from "@/lib/device-agent/server/jobs";

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
  if (!isAutonomyEnabled()) {
    return Response.json(
      { skipped: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  try {
    const admin = createAdminClient();
    const leases = await reapExpiredLeases(admin);
    const deviceJobs = await reclaimExpiredDeviceJobs(admin);
    const runs = await processDueRuns(admin);
    return Response.json(
      { leases, runs, deviceJobsReclaimed: deviceJobs.length },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("resolution runs worker failed", error);
    return Response.json(
      { error: "Resolution runs worker failed." },
      { status: 500 }
    );
  }
}
