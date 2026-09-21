import { createAdminClient } from "@/lib/supabase/admin";
import { getDeviceAction } from "@/lib/device-agent/catalog";
import {
  shadowBatchSchema,
  type ShadowBatch,
} from "@/lib/device-agent/protocol";
import type { DeviceRow } from "./auth";

export async function storeShadowActions(
  admin: ReturnType<typeof createAdminClient>,
  device: DeviceRow,
  batch: ShadowBatch
): Promise<void> {
  const parsed = shadowBatchSchema.parse(batch);
  const rows = parsed.actions.map((action) => {
    const definition = getDeviceAction(action.actionId, action.actionVersion);
    if (!definition || !definition.platforms.includes(device.platform))
      throw new Error("unknown_action");
    if (definition.irreversible !== action.irreversible)
      throw new Error("invalid_action");
    return {
      organization_id: device.organization_id,
      device_id: device.id,
      action_id: action.actionId,
      action_version: action.actionVersion,
      parameters_hash: action.parametersHash,
      reason: action.reason,
      evidence_kinds: action.evidenceKinds,
      snapshot_spec: action.snapshotSpec,
      irreversible: action.irreversible,
      catalog_version: device.catalog_version,
    };
  });
  const result = await admin.from("device_shadow_actions").insert(rows);
  if (result.error) throw result.error;
}
