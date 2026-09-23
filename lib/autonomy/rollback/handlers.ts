import { redactAuditDetail } from "../audit/redact";
import { auditVersions } from "../audit/versions";
import type { RollbackHandler, RollbackResult } from "./types";
import { getIdentityBinding } from "@/lib/autonomy/connectors/binding";
import { loadDirectoryForOrganization } from "@/lib/autonomy/connectors";
import { getDeviceAction } from "@/lib/device-agent/catalog";
import { enqueueDeviceJob } from "@/lib/device-agent/server/jobs";

const handlers: RollbackHandler[] = [
  {
    capabilityId: "device_flush_dns",
    version: 1,
    method: "handler:device_restore_snapshot",
    async run(context) {
      return deviceSnapshotRollback(context);
    },
  },
  {
    capabilityId: "device_reset_network_adapter",
    version: 1,
    method: "handler:device_restore_snapshot",
    async run(context) {
      return deviceSnapshotRollback(context);
    },
  },
  {
    capabilityId: "device_reset_wifi_profile",
    version: 1,
    method: "handler:device_restore_snapshot",
    async run(context) {
      return deviceSnapshotRollback(context);
    },
  },
  {
    capabilityId: "device_restart_service",
    version: 1,
    method: "handler:device_restore_snapshot",
    async run(context) {
      return deviceSnapshotRollback(context);
    },
  },
  {
    capabilityId: "grant_group_access",
    version: 1,
    method: "handler:remove_group_access",
    async run(context): Promise<RollbackResult> {
      const groupId =
        typeof context.parameters.groupId === "string"
          ? context.parameters.groupId
          : null;
      const binding = await getIdentityBinding(context.admin, context.runId);
      const loaded = await loadDirectoryForOrganization(
        context.admin,
        context.organizationId
      );
      if (!groupId || !binding || !loaded) {
        return { ok: false, output: {}, error: "identity_unbound" };
      }
      const result = await loaded.directory.removeFromGroup(
        binding.directoryUserId,
        groupId,
        context.signal
      );
      if (!result.ok)
        return { ok: false, output: {}, error: result.error.kind };
      await context.admin.from("resolution_events").insert({
        organization_id: context.organizationId,
        run_id: context.runId,
        ticket_id: context.ticketId,
        kind: "identity.group_grant_rolled_back",
        actor: "orchestrator",
        detail: redactAuditDetail({
          groupId,
          removedAt: result.value.removedAt,
        }),
        initiated_by: "ai",
        versions: auditVersions({ id: "grant_group_access", version: 1 }),
      });
      return {
        ok: true,
        output: { groupId, removedAt: result.value.removedAt },
      };
    },
  },
  {
    capabilityId: "route_to_department",
    version: 1,
    method: "compensating",
    async run(context): Promise<RollbackResult> {
      if (context.signal.aborted)
        return { ok: false, output: {}, error: "aborted" };
      const department =
        typeof context.parameters.department === "string"
          ? context.parameters.department
          : null;
      const detail = redactAuditDetail({ department });
      await context.admin.from("resolution_events").insert({
        organization_id: context.organizationId,
        run_id: context.runId,
        ticket_id: context.ticketId,
        kind: "ticket.department_routing_reverted",
        actor: "orchestrator",
        detail,
        initiated_by: "ai",
        versions: auditVersions({ id: "route_to_department", version: 1 }),
      });
      if (context.signal.aborted)
        return { ok: false, output: {}, error: "aborted" };
      await context.admin.from("resolution_events").insert({
        organization_id: context.organizationId,
        run_id: context.runId,
        ticket_id: context.ticketId,
        kind: "resolution.event",
        actor: "orchestrator",
        detail: redactAuditDetail({
          action: "route_to_department.rollback",
          department,
        }),
        initiated_by: "ai",
        versions: auditVersions({ id: "route_to_department", version: 1 }),
      });
      const output: RollbackResult["output"] = {
        reverted: true,
        department,
      };
      return { ok: true, output };
    },
  },
];

async function deviceSnapshotRollback(
  context: Parameters<RollbackHandler["run"]>[0]
): Promise<RollbackResult> {
  const original = await context.admin
    .from("device_jobs")
    .select(
      "id,device_id,action_id,action_version,snapshot_hash,snapshot_kinds"
    )
    .eq("organization_id", context.organizationId)
    .eq("execution_id", context.executionId)
    .eq("kind", "action")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = original.data as {
    id: string;
    device_id: string;
    action_id: string;
    action_version: number;
    snapshot_hash: string | null;
    snapshot_kinds: string[];
  } | null;
  if (!row?.snapshot_hash)
    return { ok: false, output: {}, error: "snapshot_missing" };
  const action = getDeviceAction(row.action_id, row.action_version);
  const device = await context.admin
    .from("devices")
    .select(
      "id,organization_id,user_id,device_class,platform,hostname,agent_version,catalog_version,status"
    )
    .eq("id", row.device_id)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (!action || !device.data)
    return { ok: false, output: {}, error: "device_missing" };
  const job = await enqueueDeviceJob(context.admin, {
    organizationId: context.organizationId,
    deviceId: row.device_id,
    runId: context.runId,
    executionId: context.executionId,
    ticketId: context.ticketId,
    actionId: row.action_id,
    actionVersion: row.action_version,
    parameters: context.parameters,
    kind: "rollback",
    rollbackOf: row.id,
    snapshotSpec: row.snapshot_kinds,
  });
  return { ok: true, output: { jobId: job.id, status: job.status } };
}

export function getRollbackHandler(
  capabilityId: string,
  version: number
): RollbackHandler | null {
  return (
    handlers.find(
      (handler) =>
        handler.capabilityId === capabilityId && handler.version === version
    ) ?? null
  );
}
