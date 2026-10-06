"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setKillSwitch } from "@/lib/autonomy/kill-switches";
import { pilotActionLimiter } from "./admin-pilot-limiter";

const clearSchema = z
  .object({
    scope: z.enum(["capability", "global"]),
    scopeId: z.string().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === "capability" && !value.scopeId) {
      context.addIssue({
        code: "custom",
        path: ["scopeId"],
        message: "Capability scope requires an ID.",
      });
    }
    if (value.scope === "global" && value.scopeId !== null) {
      context.addIssue({
        code: "custom",
        path: ["scopeId"],
        message: "Global scope cannot have an ID.",
      });
    }
  });

export async function clearBlastRadiusStopAction(
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  const session = await getAdminSession();
  if (!session?.isPlatformAdmin)
    return { error: "Platform admin access required." };
  const rate = await pilotActionLimiter.check(
    `org:${session.organizationId}:user:${session.userId}`
  );
  if (!rate.allowed) return { error: "Too many pilot action attempts." };
  const parsed = clearSchema.safeParse({
    scope: formData.get("scope"),
    scopeId: formData.get("scopeId") || null,
  });
  if (!parsed.success) return { error: "Invalid blast-radius stop." };
  let query = createAdminClient()
    .from("ai_kill_switches")
    .select("id,enabled,reason")
    .eq("scope", parsed.data.scope);
  query =
    parsed.data.scopeId === null
      ? query.is("scope_id", null)
      : query.eq("scope_id", parsed.data.scopeId);
  const current = await query.maybeSingle();
  if (
    current.error ||
    !current.data?.enabled ||
    typeof current.data.reason !== "string" ||
    !current.data.reason.startsWith("blast_radius:")
  ) {
    return { error: "Automatic blast-radius stop is not active." };
  }
  const result = await setKillSwitch(createAdminClient(), {
    scope: parsed.data.scope,
    scopeId: parsed.data.scopeId,
    enabled: false,
    reason: "blast_radius_cleared",
    setBy: session.userId,
    organizationId: null,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/resolution/guardrails");
  return { success: true };
}

export async function clearBlastRadiusStopFormAction(
  formData: FormData
): Promise<void> {
  await clearBlastRadiusStopAction(formData);
}
