import { catalogResponse } from "@/lib/device-agent/server/catalog";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (!isDeviceAgentEnabled())
    return Response.json({}, { status: 404, headers });
  return Response.json(catalogResponse(), { headers });
}
