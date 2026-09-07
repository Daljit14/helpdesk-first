import { createAdminClient } from "@/lib/supabase/admin";

export type OrganizationPolicy = {
  organizationId: string;
  allowVerificationException: boolean;
  reopenWindowDays: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function getOrganizationPolicy(
  organizationId: string
): Promise<OrganizationPolicy> {
  const { data } = await createAdminClient()
    .from("organization_policies")
    .select(
      "organization_id,allow_verification_exception,reopen_window_days,updated_at,updated_by"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  return {
    organizationId,
    allowVerificationException: Boolean(data?.allow_verification_exception),
    reopenWindowDays: Number(data?.reopen_window_days ?? 14),
    updatedAt: data?.updated_at ?? null,
    updatedBy: data?.updated_by ?? null,
  };
}
