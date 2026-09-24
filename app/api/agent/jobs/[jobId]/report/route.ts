import { jobReportSchema } from "@/lib/device-agent/protocol";
import { authenticateDeviceRequest } from "@/lib/device-agent/server/auth";
import { recordJobResult } from "@/lib/device-agent/server/jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
): Promise<Response> {
  if (!isDeviceAgentEnabled()) return Response.json({}, { status: 404 });
  const rawBody = await request.text();
  const admin = createAdminClient();
  const auth = await authenticateDeviceRequest(admin, request, rawBody);
  if (!auth.ok)
    return Response.json({ error: auth.code }, { status: auth.status });
  try {
    const report = jobReportSchema.parse(JSON.parse(rawBody));
    const { jobId } = await context.params;
    const result = await recordJobResult(admin, auth.device, jobId, report);
    if (!result.ok) {
      const status =
        result.code === "wrong_device"
          ? 403
          : result.code === "terminal"
            ? 409
            : result.code === "lease_expired"
              ? 409
              : 400;
      return Response.json({ error: result.code }, { status });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
}
