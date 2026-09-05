import { timingSafeEqual } from "node:crypto";
import { getOperationsSnapshot } from "@/lib/operations/snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const expected = process.env.OPERATIONS_EXPORT_KEY;
  if (!expected) {
    return Response.json(
      { error: "Operations export is not configured." },
      { status: 503 }
    );
  }
  const authorization = request.headers.get("authorization");
  const key = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  if (!matchesSecret(key, expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const snapshot = await getOperationsSnapshot();
  return Response.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
