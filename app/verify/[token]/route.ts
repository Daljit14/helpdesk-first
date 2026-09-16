import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRateLimiter, getRateLimitConfig } from "@/lib/ai/rate-limit";
import { auditVersions } from "@/lib/autonomy/audit/versions";

const limiter = createRateLimiter(
  { ...getRateLimitConfig(), maxRequests: 20 },
  "verification-links"
);
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!(await limiter.check(ip)).allowed)
    return new NextResponse("Too many requests", { status: 429 });
  const { token } = await context.params;
  const hash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();
  const row = await admin
    .from("verification_links")
    .select("id,organization_id,ticket_id,user_id,expires_at,used_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (
    row.error ||
    !row.data ||
    row.data.used_at ||
    new Date(row.data.expires_at).getTime() <= Date.now()
  )
    return new NextResponse("Verification link expired", { status: 410 });
  const updated = await admin
    .from("verification_links")
    .update({ used_at: new Date().toISOString() })
    .eq("id", row.data.id)
    .eq("organization_id", row.data.organization_id)
    .is("used_at", null);
  if (updated.error)
    return new NextResponse("Verification link unavailable", { status: 410 });
  await admin
    .from("tickets")
    .update({ user_confirmed: true })
    .eq("id", row.data.ticket_id)
    .eq("organization_id", row.data.organization_id)
    .eq("user_id", row.data.user_id);
  await admin.from("resolution_events").insert({
    organization_id: row.data.organization_id,
    ticket_id: row.data.ticket_id,
    kind: "verification.user_confirmed",
    actor: "requester",
    initiated_by: "user",
    versions: auditVersions(),
    detail: {},
  });
  return NextResponse.redirect(
    new URL(`/tickets/${row.data.ticket_id}`, request.url)
  );
}
