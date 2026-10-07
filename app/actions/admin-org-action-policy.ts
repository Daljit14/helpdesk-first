"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isOrgActionPolicyEnabled } from "@/lib/admin/flags";
import { getAdminSession, recordAudit } from "@/lib/admin/auth";
import { createRateLimiter, getRateLimitConfig } from "@/lib/ai/rate-limit";
import { getCapability } from "@/lib/autonomy/capabilities/registry";
import { isDenylisted } from "@/lib/agent/denylist";
import { orgActionPolicyInputSchema } from "@/lib/autonomy/policy/org-policy";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrgActionPolicyActionResult =
  | { success: true; message: string }
  | { error: string; fieldErrors?: Record<string, string> };

type Session = NonNullable<Awaited<ReturnType<typeof getAdminSession>>>;

const limiter = createRateLimiter(
  { ...getRateLimitConfig(), maxRequests: 30 },
  "org-action-policy"
);
const idSchema = z.string().uuid();

async function sessionOrError(): Promise<
  Session | OrgActionPolicyActionResult
> {
  if (!isOrgActionPolicyEnabled())
    return { error: "AI action policy is disabled." };
  const session = await getAdminSession();
  if (!session || session.role !== "org_admin")
    return { error: "Organization admin access required." };
  if (
    !(
      await limiter.check(
        `org:${session.organizationId}:user:${session.userId}`
      )
    ).allowed
  )
    return { error: "Too many AI action policy requests." };
  return session;
}

function isSession(
  value: Session | OrgActionPolicyActionResult
): value is Session {
  return "organizationId" in value;
}

function validationErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "form", issue.message])
  );
}

function validCapability(capabilityId: string): boolean {
  if (capabilityId === "*") return true;
  const capability = getCapability(capabilityId, 1);
  return Boolean(capability && !isDenylisted(capability.id, capability));
}

function rowValues(
  input: z.infer<typeof orgActionPolicyInputSchema>,
  userId: string
) {
  return {
    capability_id: input.capabilityId,
    effect: input.effect,
    scope_groups: input.scopeGroups,
    max_tier: input.maxTier,
    autorun_windows: input.autorunWindows,
    require_staff_approval: input.requireStaffApproval,
    note: input.note,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
}

export async function saveOrgActionPolicyAction(
  input: unknown
): Promise<OrgActionPolicyActionResult> {
  const session = await sessionOrError();
  if (!isSession(session)) return session;
  const parsed = orgActionPolicyInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: "Review the highlighted policy fields.",
      fieldErrors: validationErrors(parsed.error),
    };
  if (!validCapability(parsed.data.capabilityId))
    return {
      error: "Choose an available capability.",
      fieldErrors: { capabilityId: "Choose an available capability." },
    };

  try {
    const admin = createAdminClient();
    const table = admin.from("org_action_policies");
    let before: Record<string, unknown> | null = null;
    if (parsed.data.id) {
      const existing = await admin
        .from("org_action_policies")
        .select("*")
        .eq("id", parsed.data.id)
        .eq("organization_id", session.organizationId)
        .maybeSingle();
      if (existing.error || !existing.data)
        return { error: "That policy was not found." };
      before = existing.data as Record<string, unknown>;
    } else {
      const count = await admin
        .from("org_action_policies")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", session.organizationId);
      if (count.error || count.count === null)
        return { error: "The policy could not be saved." };
      if (count.count >= 100)
        return { error: "An organization can have at most 100 policy rules." };
    }

    const values = rowValues(parsed.data, session.userId);
    const saved = parsed.data.id
      ? await table
          .update(values)
          .eq("id", parsed.data.id)
          .eq("organization_id", session.organizationId)
          .select("*")
          .maybeSingle()
      : await table
          .insert({
            organization_id: session.organizationId,
            ...values,
          })
          .select("*")
          .maybeSingle();
    if (saved.error || !saved.data)
      return { error: "The policy could not be saved." };

    const after = saved.data as Record<string, unknown>;
    const event = await admin.from("org_action_policy_events").insert({
      organization_id: session.organizationId,
      policy_id: after.id,
      capability_id: parsed.data.capabilityId,
      action: before ? "updated" : "created",
      before,
      after,
      actor_user_id: session.userId,
    });
    if (event.error) {
      if (before) {
        await admin
          .from("org_action_policies")
          .update({
            capability_id: before.capability_id,
            effect: before.effect,
            scope_groups: before.scope_groups,
            max_tier: before.max_tier,
            autorun_windows: before.autorun_windows,
            require_staff_approval: before.require_staff_approval,
            note: before.note,
            updated_by: before.updated_by,
            updated_at: before.updated_at,
          })
          .eq("id", parsed.data.id!)
          .eq("organization_id", session.organizationId);
      } else {
        await admin
          .from("org_action_policies")
          .delete()
          .eq("id", after.id)
          .eq("organization_id", session.organizationId);
      }
      return { error: "The policy could not be audited." };
    }

    await recordAudit(session, "org_policy.saved", parsed.data.capabilityId);
    revalidatePath("/admin/resolution/policy");
    return { success: true, message: "Policy saved." };
  } catch {
    return { error: "The policy could not be saved." };
  }
}

export async function deleteOrgActionPolicyAction(
  id: string
): Promise<OrgActionPolicyActionResult> {
  const session = await sessionOrError();
  if (!isSession(session)) return session;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { error: "The policy could not be removed." };

  try {
    const admin = createAdminClient();
    const existing = await admin
      .from("org_action_policies")
      .select("*")
      .eq("id", parsedId.data)
      .eq("organization_id", session.organizationId)
      .maybeSingle();
    if (existing.error || !existing.data)
      return { error: "That policy was not found." };
    const before = existing.data as Record<string, unknown>;
    const deleted = await admin
      .from("org_action_policies")
      .delete()
      .eq("id", parsedId.data)
      .eq("organization_id", session.organizationId)
      .select("id")
      .maybeSingle();
    if (deleted.error || !deleted.data)
      return { error: "The policy could not be removed." };

    const event = await admin.from("org_action_policy_events").insert({
      organization_id: session.organizationId,
      policy_id: parsedId.data,
      capability_id: String(before.capability_id),
      action: "deleted",
      before,
      after: null,
      actor_user_id: session.userId,
    });
    if (event.error) {
      await admin.from("org_action_policies").insert(before);
      return { error: "The policy could not be audited." };
    }

    await recordAudit(
      session,
      "org_policy.deleted",
      String(before.capability_id)
    );
    revalidatePath("/admin/resolution/policy");
    return { success: true, message: "Policy removed." };
  } catch {
    return { error: "The policy could not be removed." };
  }
}
