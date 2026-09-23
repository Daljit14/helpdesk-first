import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { backfillEncryption } from "@/lib/security/backfill";
import { DataProtectionError } from "@/lib/security/field-crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { expireStaleJobs } from "@/lib/device-agent/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/, "");
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export async function GET(request: Request) {
  if (!authorized(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const admin = createAdminClient();
    const result = await backfillEncryption(admin);
    const cleanup = await admin
      .from("device_nonces")
      .delete()
      .lt("expires_at", new Date().toISOString());
    if (cleanup.error) throw cleanup.error;
    await expireStaleJobs(admin);
    return NextResponse.json(result);
  } catch (error) {
    const dataProtectionError = error instanceof DataProtectionError;
    const code = dataProtectionError ? error.code : "backfill_failed";
    console.error("data-protection backfill failed", { code });
    return NextResponse.json(
      { error: code },
      { status: dataProtectionError ? 503 : 500 }
    );
  }
}
