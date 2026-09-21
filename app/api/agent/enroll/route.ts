import { enrollDevice } from "@/lib/device-agent/server/enroll";
import {
  enrollRequestSchema,
  enrollResponseSchema,
} from "@/lib/device-agent/protocol";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeviceAgentEnabled } from "@/lib/admin/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isDeviceAgentEnabled()) return json({}, 404);
  try {
    const body = enrollRequestSchema.parse(await request.json());
    const result = enrollResponseSchema.parse(
      await enrollDevice(
        createAdminClient(),
        body,
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown"
      )
    );
    return json(result);
  } catch {
    return json({ error: "enrollment_failed" }, 400);
  }
}
