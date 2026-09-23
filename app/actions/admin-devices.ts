"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEnrollmentToken } from "@/lib/device-agent/server/enroll";
import { upsertConsentPolicy } from "@/lib/device-agent/server/consent-policies";

const limiter = createRateLimiter(
  { windowMs: 60_000, maxRequests: 30 },
  "admin-devices"
);
const idSchema = z.string().uuid();

async function adminSession() {
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin") return null;
  if (!(await limiter.check(session.userId)).allowed) return null;
  return session;
}

export async function createEnrollmentTokenAction(input: unknown) {
  const session = await adminSession();
  if (!session) return { error: "Organization admin access required." };
  const parsed = z
    .object({
      deviceClass: z.enum(["managed", "byod"]),
      label: z.string().trim().min(1).max(200),
      ttlHours: z.number().int().min(1).max(168),
      maxUses: z.number().int().min(1).max(50),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid enrollment token." };
  try {
    const result = await createEnrollmentToken(createAdminClient(), {
      ...parsed.data,
      organizationId: session.organizationId,
      createdBy: session.userId,
    });
    await recordAudit(session, "device.enrollment_token_created", result.id);
    revalidatePath("/admin/devices");
    return { success: true, token: result.token, expiresAt: result.expiresAt };
  } catch {
    return { error: "Unable to create enrollment token." };
  }
}

export async function revokeEnrollmentTokenAction(input: unknown) {
  const session = await adminSession();
  const id = idSchema.safeParse(input);
  if (!session || !id.success) return { error: "Not authorized." };
  await createAdminClient()
    .from("device_enrollment_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("organization_id", session.organizationId);
  await recordAudit(session, "device.enrollment_token_revoked", id.data);
  revalidatePath("/admin/devices");
  return { success: true };
}

export async function revokeDeviceAction(input: unknown) {
  const session = await adminSession();
  const parsed = z
    .object({ id: idSchema, reason: z.string().trim().max(500).optional() })
    .safeParse(input);
  if (!session || !parsed.success) return { error: "Not authorized." };
  await createAdminClient()
    .from("devices")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: session.userId,
      revoke_reason: parsed.data.reason ?? null,
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", session.organizationId);
  await recordAudit(session, "device.revoked", parsed.data.id);
  revalidatePath("/admin/devices");
  return { success: true };
}

export async function reviewDeviceShadowAction(input: unknown) {
  const session = await adminSession();
  const parsed = z
    .object({
      id: idSchema,
      status: z.enum(["agree", "disagree", "unsafe"]),
      note: z.string().trim().max(2000).optional(),
    })
    .safeParse(input);
  if (!session || !parsed.success) return { error: "Not authorized." };
  const result = await createAdminClient()
    .from("device_shadow_actions")
    .update({
      review_status: parsed.data.status,
      review_note: parsed.data.note ?? null,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", session.organizationId)
    .select("id")
    .maybeSingle();
  if (result.error || !result.data)
    return { error: "Shadow action not found." };
  await recordAudit(session, "device.shadow_reviewed", parsed.data.id);
  revalidatePath("/admin/devices");
  return { success: true };
}

export async function upsertDeviceConsentPolicyAction(input: unknown) {
  const session = await adminSession();
  const parsed = z
    .object({
      deviceClass: z.enum(["managed", "byod"]),
      category: z.enum(["network", "security", "endpoint", "peripheral"]),
      autoApprove: z.boolean(),
    })
    .safeParse(input);
  if (!session || !parsed.success) return { error: "Not authorized." };
  const ok = await upsertConsentPolicy(createAdminClient(), {
    organizationId: session.organizationId,
    updatedBy: session.userId,
    ...parsed.data,
  });
  if (!ok) return { error: "Unable to update consent policy." };
  await recordAudit(
    session,
    "device.consent_policy_updated",
    `${parsed.data.deviceClass}:${parsed.data.category}`
  );
  revalidatePath("/admin/devices");
  return { success: true };
}
