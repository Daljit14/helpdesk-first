"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRateLimiter } from "@/lib/ai/rate-limit";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setTier, type AutonomyTier } from "@/lib/autonomy/ladder";

const limiter = createRateLimiter(
  { windowMs: 60_000, maxRequests: 30 },
  "admin-autonomy-ladder"
);

export async function setCapabilityTierAction(input: unknown) {
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin")
    return { error: "Organization admin access required." };
  if (!(await limiter.check(session.userId)).allowed)
    return { error: "Too many changes. Try again in a minute." };
  const parsed = z
    .object({
      capabilityId: z.string().min(1).max(100),
      toTier: z.enum(["disabled", "shadow", "consent", "autorun"]),
      reason: z.string().trim().min(3).max(500),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Invalid autonomy ladder change." };
  const result = await setTier(createAdminClient(), {
    organizationId: session.organizationId,
    capabilityId: parsed.data.capabilityId,
    toTier: parsed.data.toTier as AutonomyTier,
    reason: parsed.data.reason,
    actor: `admin:${session.userId}`,
    actorUserId: session.userId,
    kind: parsed.data.toTier === "autorun" ? "promotion" : "admin_set",
  });
  if (!result.ok) return { error: result.reasons.join(" ") };
  await recordAudit(session, "autonomy.tier_set", parsed.data.capabilityId);
  revalidatePath("/admin/devices");
  revalidatePath("/admin/resolution");
  return { ok: true as const };
}
