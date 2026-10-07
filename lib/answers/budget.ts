import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export async function consumeAnswerEngineBudget(
  admin: Admin,
  input: {
    organizationId: string | null;
    units: number;
    organizationLimit: number;
    globalLimit: number;
  }
): Promise<boolean> {
  if (input.units <= 0 || input.globalLimit <= 0) return false;
  try {
    const result = await admin.rpc("answer_engine_consume_budget", {
      p_organization_id: input.organizationId,
      p_units: input.units,
      p_org_limit: input.organizationLimit,
      p_global_limit: input.globalLimit,
    });
    return result.error === null && result.data === true;
  } catch {
    return false;
  }
}
