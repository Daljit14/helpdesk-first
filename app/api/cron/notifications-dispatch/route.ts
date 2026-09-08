import { timingSafeEqual } from "node:crypto";
import { dispatchPending } from "@/lib/notifications/dispatch";
import { scanSla } from "@/lib/notifications/sla-scan";

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
  try {
    const sla = await scanSla();
    const dispatched = await dispatchPending({ limit: 200 });
    return Response.json(
      { sla, dispatched },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("notification dispatch failed", error);
    return Response.json(
      { error: "Notification dispatch failed." },
      { status: 500 }
    );
  }
}
