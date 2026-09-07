import { timingSafeEqual } from "node:crypto";
import { purgeExpiredAttachments } from "@/lib/attachments/purge";

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
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  if (!matchesSecret(supplied, expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return Response.json(await purgeExpiredAttachments(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("attachment purge failed", error);
    return Response.json({ error: "Purge failed." }, { status: 500 });
  }
}
