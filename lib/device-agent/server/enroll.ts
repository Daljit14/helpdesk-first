import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRateLimiter, getClientIp } from "@/lib/ai/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deviceClassSchema,
  enrollRequestSchema,
  type EnrollRequest,
} from "@/lib/device-agent/protocol";
import { DEVICE_CATALOG_VERSION } from "@/lib/device-agent/catalog";

const enrollmentLimiter = createRateLimiter(
  { windowMs: 60_000, maxRequests: 10 },
  "device-enrollment"
);

export type EnrollmentTokenInput = {
  organizationId: string;
  deviceClass: "managed" | "byod";
  label: string;
  createdBy: string;
  ttlHours: number;
  maxUses: number;
};

export async function createEnrollmentToken(
  admin: ReturnType<typeof createAdminClient>,
  input: EnrollmentTokenInput
): Promise<{ id: string; token: string; expiresAt: string }> {
  const parsedClass = deviceClassSchema.parse(input.deviceClass);
  if (input.ttlHours < 1 || input.ttlHours > 168)
    throw new Error("invalid ttl");
  if (input.maxUses < 1 || input.maxUses > 50)
    throw new Error("invalid max uses");
  const token = `hd1_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(
    Date.now() + input.ttlHours * 3600_000
  ).toISOString();
  const id = randomUUID();
  const inserted = await admin.from("device_enrollment_tokens").insert({
    id,
    organization_id: input.organizationId,
    token_hash: createHash("sha256").update(token).digest("hex"),
    device_class: parsedClass,
    label: input.label.trim().slice(0, 200),
    created_by: input.createdBy,
    expires_at: expiresAt,
    max_uses: input.maxUses,
  });
  if (inserted.error) throw inserted.error;
  return { id, token, expiresAt };
}

export async function enrollDevice(
  admin: ReturnType<typeof createAdminClient>,
  input: EnrollRequest,
  ip: string
): Promise<{
  deviceId: string;
  organizationId: string;
  pollIntervalSec: number;
  catalogVersion: string;
}> {
  const parsed = enrollRequestSchema.parse(input);
  const limited = await enrollmentLimiter.check(ip);
  if (!limited.allowed) throw new Error("rate_limited");
  const tokenHash = createHash("sha256").update(parsed.token).digest("hex");
  const tokenResult = await admin
    .from("device_enrollment_tokens")
    .select(
      "id,organization_id,device_class,expires_at,max_uses,used_count,revoked_at,created_by"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const token = tokenResult.data as {
    id: string;
    organization_id: string;
    device_class: "managed" | "byod";
    expires_at: string;
    max_uses: number;
    used_count: number;
    revoked_at: string | null;
    created_by: string;
  } | null;
  if (
    !token ||
    token.revoked_at ||
    token.used_count >= token.max_uses ||
    new Date(token.expires_at) <= new Date()
  )
    throw new Error("invalid_token");
  const used = await admin
    .from("device_enrollment_tokens")
    .update({ used_count: token.used_count + 1 })
    .eq("id", token.id)
    .eq("used_count", token.used_count)
    .lt("used_count", token.max_uses)
    .select("id")
    .maybeSingle();
  if (used.error || !used.data) throw new Error("invalid_token");
  const deviceId = randomUUID();
  const inserted = await admin.from("devices").insert({
    id: deviceId,
    organization_id: token.organization_id,
    device_class: token.device_class,
    platform: parsed.platform,
    hostname: parsed.hostname,
    agent_version: parsed.agentVersion,
    public_key: parsed.publicKey,
    catalog_version: DEVICE_CATALOG_VERSION,
  });
  if (inserted.error) throw inserted.error;
  await admin.from("operations_audit").insert({
    organization_id: token.organization_id,
    actor_user_id: token.created_by,
    actor_role: "device_agent",
    action: "device.enrolled",
    target: deviceId,
  });
  return {
    deviceId,
    organizationId: token.organization_id,
    pollIntervalSec: 300,
    catalogVersion: DEVICE_CATALOG_VERSION,
  };
}

export { getClientIp };
