import {
  heartbeatRequestSchema,
  heartbeatResponseSchema,
} from "@/lib/device-agent/protocol";
import { authenticateDeviceRequest } from "@/lib/device-agent/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";
import { DEVICE_CATALOG_VERSION } from "@/lib/device-agent/catalog";
import { readKillSwitches } from "@/lib/autonomy/kill-switches";
import { resolveJobMode } from "@/lib/device-agent/server/jobs";

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
    heartbeatRequestSchema.parse(JSON.parse(rawBody));
    const switches = await readKillSwitches(admin, auth.device.organization_id);
    const mode = await resolveJobMode(admin, {
      organizationId: auth.device.organization_id,
    });
    const response = heartbeatResponseSchema.parse({
      pollIntervalSec: 300,
      killSwitch: switches.anyActive,
      executionEnabled: mode === "execute" && !switches.anyActive,
      catalogVersion: DEVICE_CATALOG_VERSION,
      revoked: auth.device.status === "revoked",
    });
    return Response.json(response, { headers });
  } catch {
    return Response.json(
      { error: "invalid_request" },
      { status: 400, headers }
    );
  }
}
