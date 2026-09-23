import { jobPollResponseSchema } from "@/lib/device-agent/protocol";
import { authenticateDeviceRequest } from "@/lib/device-agent/server/auth";
import { leaseJobsForDevice } from "@/lib/device-agent/server/jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!isDeviceAgentEnabled()) return Response.json({}, { status: 404 });
  const rawBody = await request.text();
  const admin = createAdminClient();
  const auth = await authenticateDeviceRequest(admin, request, rawBody);
  if (!auth.ok)
    return Response.json({ error: auth.code }, { status: auth.status });
  try {
    const jobs = await leaseJobsForDevice(admin, auth.device);
    return Response.json(
      jobPollResponseSchema.parse({
        jobs: jobs.map((job) => ({
          id: job.id,
          actionId: job.action_id,
          actionVersion: job.action_version,
          parameters: job.parameters,
          mode: job.mode,
          kind: job.kind,
          rollbackOf: job.rollback_of,
          expiresAt: job.expires_at,
          snapshotSpec: job.snapshot_spec,
        })),
      })
    );
  } catch {
    return Response.json({ error: "job_poll_failed" }, { status: 500 });
  }
}
