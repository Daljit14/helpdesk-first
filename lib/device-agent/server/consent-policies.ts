import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type DeviceConsentPolicy = {
  id: string;
  organization_id: string;
  device_class: "managed" | "byod";
  category: "network" | "security" | "endpoint" | "peripheral";
  auto_approve: boolean;
  updated_by: string | null;
  updated_at: string;
};

export async function readConsentPolicies(
  admin: Admin,
  organizationId: string
): Promise<DeviceConsentPolicy[]> {
  const result = await admin
    .from("device_consent_policies")
    .select(
      "id,organization_id,device_class,category,auto_approve,updated_by,updated_at"
    )
    .eq("organization_id", organizationId)
    .order("category");
  return result.error ? [] : (result.data as DeviceConsentPolicy[]);
}

export async function upsertConsentPolicy(
  admin: Admin,
  input: {
    organizationId: string;
    deviceClass: DeviceConsentPolicy["device_class"];
    category: DeviceConsentPolicy["category"];
    autoApprove: boolean;
    updatedBy: string;
  }
): Promise<boolean> {
  const result = await admin.from("device_consent_policies").upsert(
    {
      organization_id: input.organizationId,
      device_class: input.deviceClass,
      category: input.category,
      auto_approve: input.autoApprove,
      updated_by: input.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,device_class,category" }
  );
  return !result.error;
}
