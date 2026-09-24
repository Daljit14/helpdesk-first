import { createHash } from "node:crypto";
import {
  DEVICE_CATALOG_VERSION,
  getDeviceAction,
  ticketPlatformToDevicePlatform,
} from "@/lib/device-agent/catalog";
import {
  getDeviceExecutionOrgAllowlist,
  getDeviceJobTtlMin,
} from "@/lib/autonomy/config";
import { isDeviceExecutionEnabled } from "@/lib/admin/flags";
import { readKillSwitches } from "@/lib/autonomy/kill-switches";
import { redactAuditDetail } from "@/lib/autonomy/audit/redact";
import { sanitizeOutput } from "@/lib/autonomy/executor/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEVICE_JOB_LEASE_SECONDS,
  jobReportSchema,
  type JobReport,
} from "@/lib/device-agent/protocol";
import type { DeviceRow } from "./auth";
import { storeDiagnostics } from "./diagnostics";

type Admin = ReturnType<typeof createAdminClient>;
export type DeviceJobMode = "shadow" | "execute";
export type DeviceJob = {
  id: string;
  organization_id: string;
  device_id: string;
  run_id: string;
  step_id: string | null;
  execution_id: string | null;
  approval_request_id: string | null;
  ticket_id: string;
  action_id: string;
  action_version: number;
  catalog_version: string;
  parameters: Record<string, unknown>;
  parameter_hash: string;
  mode: DeviceJobMode;
  kind: "action" | "rollback";
  rollback_of: string | null;
  status: string;
  expires_at: string;
  snapshot_spec: string[];
  [key: string]: unknown;
};

const SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

export function killSwitchBlocksDeviceJob(
  switches: Pick<
    Awaited<ReturnType<typeof readKillSwitches>>,
    "anyActive" | "explicit"
  >,
  mode: DeviceJobMode
): boolean {
  return mode === "execute" ? switches.anyActive : switches.explicit;
}

function hashParameters(parameters: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(parameters, Object.keys(parameters).sort()))
    .digest("hex");
}

export async function resolveJobMode(
  admin: Admin,
  input: { organizationId: string; capabilityId?: string }
): Promise<DeviceJobMode> {
  if (!isDeviceExecutionEnabled()) return "shadow";
  if (!getDeviceExecutionOrgAllowlist().includes(input.organizationId))
    return "shadow";
  const switches = await readKillSwitches(
    admin,
    input.organizationId,
    input.capabilityId
  );
  return switches.anyActive ? "shadow" : "execute";
}

export async function enqueueDeviceJob(
  admin: Admin,
  input: {
    organizationId: string;
    deviceId: string;
    runId: string;
    stepId?: string | null;
    executionId?: string | null;
    approvalRequestId?: string | null;
    ticketId: string;
    actionId: string;
    actionVersion: number;
    parameters: Record<string, unknown>;
    kind: "action" | "rollback";
    rollbackOf?: string | null;
    snapshotSpec?: string[];
  }
): Promise<DeviceJob> {
  const action = getDeviceAction(input.actionId, input.actionVersion);
  if (!action) throw new Error("unknown_device_action");
  if (!action.inputSchema.safeParse(input.parameters).success)
    throw new Error("invalid_device_parameters");
  const mode = await resolveJobMode(admin, {
    organizationId: input.organizationId,
    capabilityId: input.actionId,
  });
  const row = {
    organization_id: input.organizationId,
    device_id: input.deviceId,
    run_id: input.runId,
    step_id: input.stepId ?? null,
    execution_id: input.executionId ?? null,
    approval_request_id: input.approvalRequestId ?? null,
    ticket_id: input.ticketId,
    action_id: input.actionId,
    action_version: input.actionVersion,
    catalog_version: DEVICE_CATALOG_VERSION,
    parameters: input.parameters,
    parameter_hash: hashParameters(input.parameters),
    mode,
    kind: input.kind,
    rollback_of: input.rollbackOf ?? null,
    expires_at: new Date(
      Date.now() + getDeviceJobTtlMin() * 60_000
    ).toISOString(),
    snapshot_spec: input.snapshotSpec ?? [],
  };
  const result = await admin
    .from("device_jobs")
    .insert(row)
    .select("*")
    .single();
  if (result.error || !result.data)
    throw result.error ?? new Error("job_insert_failed");
  return result.data as DeviceJob;
}

export async function leaseJobsForDevice(
  admin: Admin,
  device: DeviceRow,
  limit = 3
): Promise<DeviceJob[]> {
  await reclaimExpiredDeviceJobs(admin, {
    organizationId: device.organization_id,
    deviceId: device.id,
  });
  const globalSwitches = await readKillSwitches(admin, device.organization_id);
  if (globalSwitches.explicit) {
    await admin
      .from("device_jobs")
      .update({
        status: "cancelled",
        error: "kill_switch_active",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", device.organization_id)
      .eq("device_id", device.id)
      .eq("status", "queued");
    return [];
  }
  const queued = await admin
    .from("device_jobs")
    .select("id,action_id,mode")
    .eq("organization_id", device.organization_id)
    .eq("device_id", device.id)
    .eq("status", "queued")
    .gt("expires_at", new Date().toISOString());
  const rows = (queued.data ?? []) as Array<{
    id: string;
    action_id: string;
    mode: DeviceJobMode;
  }>;
  const active = new Set<string>();
  for (const row of rows) {
    const switches = await readKillSwitches(
      admin,
      device.organization_id,
      row.action_id
    );
    if (
      killSwitchBlocksDeviceJob(switches, row.mode) ||
      (globalSwitches.envDisabled &&
        !globalSwitches.explicit &&
        row.mode === "execute")
    )
      active.add(row.id);
  }
  if (active.size)
    await admin
      .from("device_jobs")
      .update({
        status: "cancelled",
        error: "kill_switch_active",
        updated_at: new Date().toISOString(),
      })
      .in("id", [...active]);
  const result = await admin.rpc("lease_device_jobs", {
    device: device.id,
    n: Math.max(1, Math.min(limit, 10)),
    p_lease_seconds: DEVICE_JOB_LEASE_SECONDS,
  });
  if (result.error) throw result.error;
  return (result.data ?? []) as DeviceJob[];
}

export async function recordJobResult(
  admin: Admin,
  device: DeviceRow,
  jobId: string,
  report: JobReport
): Promise<
  | { ok: true }
  | {
      ok: false;
      code:
        | "wrong_device"
        | "not_leased"
        | "terminal"
        | "lease_expired"
        | "invalid_report";
    }
> {
  const parsed = jobReportSchema.safeParse(report);
  if (!parsed.success) return { ok: false, code: "invalid_report" };
  const found = await admin
    .from("device_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (found.error || !found.data) return { ok: false, code: "not_leased" };
  const job = found.data as DeviceJob;
  if (job.device_id !== device.id) {
    await auditRejectedJob(admin, device, job, "wrong_device");
    return { ok: false, code: "wrong_device" };
  }
  if (job.status !== "leased") {
    const code = job.status === "queued" ? "not_leased" : "terminal";
    await auditRejectedJob(admin, device, job, code);
    return { ok: false, code };
  }
  if (
    typeof job.lease_expires_at === "string" &&
    new Date(job.lease_expires_at).getTime() < Date.now()
  ) {
    await reclaimExpiredDeviceJobs(admin, {
      organizationId: device.organization_id,
      deviceId: device.id,
    });
    await auditRejectedJob(admin, device, job, "lease_expired");
    return { ok: false, code: "lease_expired" };
  }
  const output = redactAuditDetail(sanitizeOutput(parsed.data.output));
  let status = parsed.data.status;
  let error = parsed.data.error ?? null;
  if (job.kind === "rollback" && job.rollback_of && status === "succeeded") {
    const original = await admin
      .from("device_jobs")
      .select("snapshot_hash")
      .eq("id", job.rollback_of)
      .eq("organization_id", device.organization_id)
      .maybeSingle();
    const originalHash = (
      original.data as { snapshot_hash?: string | null } | null
    )?.snapshot_hash;
    if (!originalHash || parsed.data.snapshot?.hash !== originalHash) {
      status = "failed";
      error = "snapshot_hash_mismatch";
    }
  }
  const update = await admin
    .from("device_jobs")
    .update({
      status,
      result: output,
      snapshot_hash: parsed.data.snapshot?.hash ?? null,
      snapshot_kinds: parsed.data.snapshot?.kinds ?? [],
      error,
      reported_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("device_id", device.id)
    .eq("status", "leased");
  if (update.error) {
    await auditRejectedJob(admin, device, job, "not_leased");
    return { ok: false, code: "not_leased" };
  }
  if (parsed.data.diagnostics?.length) {
    await storeDiagnostics(admin, device, {
      records: parsed.data.diagnostics,
    });
  }
  await admin.from("operations_audit").insert({
    organization_id: device.organization_id,
    actor_user_id: device.user_id,
    actor_role: "device_agent",
    action: "device.job_reported",
    target: jobId,
  });
  return { ok: true };
}

export async function expireStaleJobs(
  admin: Admin
): Promise<{ expired: number }> {
  const rows = await reclaimExpiredDeviceJobs(admin);
  return { expired: rows.length };
}

export async function reclaimExpiredDeviceJobs(
  admin: Admin,
  scope: {
    organizationId?: string;
    deviceId?: string;
    actorUserId?: string;
  } = {}
): Promise<DeviceJob[]> {
  const result = await admin.rpc("reclaim_expired_device_jobs", {
    p_organization_id: scope.organizationId ?? null,
    p_device_id: scope.deviceId ?? null,
    p_actor: scope.actorUserId ?? null,
  });
  if (result.error) throw result.error;
  return (result.data ?? []) as DeviceJob[];
}

export async function expireOpenJobsForDevice(
  admin: Admin,
  input: {
    organizationId: string;
    deviceId: string;
    actorUserId: string;
    reason: string;
  }
): Promise<DeviceJob[]> {
  const result = await admin.rpc("expire_device_jobs_for_device", {
    p_device_id: input.deviceId,
    p_organization_id: input.organizationId,
    p_actor: input.actorUserId,
    p_reason: input.reason,
  });
  if (result.error) throw result.error;
  return (result.data ?? []) as DeviceJob[];
}

async function auditRejectedJob(
  admin: Admin,
  device: DeviceRow,
  job: DeviceJob,
  reason: string
) {
  await admin.from("operations_audit").insert({
    organization_id: device.organization_id,
    actor_user_id: device.user_id ?? SYSTEM_ACTOR_ID,
    actor_role: "device_agent",
    action: "device.job_report_rejected",
    target: `job:${job.id} reason:${reason} status:${job.status}`,
  });
}

export async function findDeviceForTicket(
  admin: Admin,
  input: { organizationId: string; ticketId: string; platform: string | null }
): Promise<DeviceRow | null> {
  const ticket = await admin
    .from("tickets")
    .select("user_id")
    .eq("organization_id", input.organizationId)
    .eq("id", input.ticketId)
    .maybeSingle();
  const userId = (ticket.data as { user_id?: string | null } | null)?.user_id;
  const platform = ticketPlatformToDevicePlatform(input.platform);
  if (!userId || !platform) return null;
  const result = await admin
    .from("devices_public")
    .select(
      "id,organization_id,user_id,device_class,platform,hostname,agent_version,catalog_version,status"
    )
    .eq("organization_id", input.organizationId)
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("status", "active")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (result.data as DeviceRow | null) ?? null;
}
