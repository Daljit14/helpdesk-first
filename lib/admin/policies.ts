import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_SLA_TARGETS, type SlaTargets } from "@/lib/tickets/sla";

export type OrganizationPolicy = {
  organizationId: string;
  allowVerificationException: boolean;
  reopenWindowDays: number;
  slaTargets: SlaTargets;
  timezone: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export async function getOrganizationPolicy(
  organizationId: string
): Promise<OrganizationPolicy> {
  const { data } = await createAdminClient()
    .from("organization_policies")
    .select(
      "organization_id,allow_verification_exception,reopen_window_days,sla_targets,timezone,updated_at,updated_by"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  return {
    organizationId,
    allowVerificationException: Boolean(data?.allow_verification_exception),
    reopenWindowDays: Number(data?.reopen_window_days ?? 14),
    slaTargets: {
      first_response: {
        ...DEFAULT_SLA_TARGETS.first_response,
        ...((data?.sla_targets as Partial<SlaTargets> | null)?.first_response ??
          {}),
      },
      resolution: {
        ...DEFAULT_SLA_TARGETS.resolution,
        ...((data?.sla_targets as Partial<SlaTargets> | null)?.resolution ??
          {}),
      },
    },
    timezone: data?.timezone ?? "America/New_York",
    updatedAt: data?.updated_at ?? null,
    updatedBy: data?.updated_by ?? null,
  };
}
