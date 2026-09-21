import { shadowBatchSchema } from "@/lib/device-agent/protocol";
import { authenticateDeviceRequest } from "@/lib/device-agent/server/auth";
import { storeShadowActions } from "@/lib/device-agent/server/shadow";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (!isDeviceAgentEnabled())
    return Response.json({}, { status: 404, headers });
  const rawBody = await request.text();
  const admin = createAdminClient();
  const auth = await authenticateDeviceRequest(admin, request, rawBody);
  if (!auth.ok)
    return Response.json(
      { error: auth.code },
      { status: auth.status, headers }
    );
  try {
    await storeShadowActions(
      admin,
      auth.device,
      shadowBatchSchema.parse(JSON.parse(rawBody))
    );
    return Response.json({ ok: true }, { headers });
  } catch {
    return Response.json(
      { error: "shadow_rejected" },
      { status: 400, headers }
    );
  }
}
