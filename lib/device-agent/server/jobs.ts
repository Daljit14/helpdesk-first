import { createHash } from "node:crypto";
import {
  DEVICE_CATALOG_VERSION,
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
import { jobReportSchema, type JobReport } from "@/lib/device-agent/protocol";
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
  const globalSwitches = await readKillSwitches(admin, device.organization_id);
  if (globalSwitches.anyActive) {
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
    .select("id,action_id")
    .eq("organization_id", device.organization_id)
    .eq("device_id", device.id)
    .eq("status", "queued")
    .gt("expires_at", new Date().toISOString());
  const rows = (queued.data ?? []) as Array<{ id: string; action_id: string }>;
  const active = new Set<string>();
  for (const row of rows) {
    const switches = await readKillSwitches(
      admin,
      device.organization_id,
      row.action_id
    );
    if (switches.anyActive) active.add(row.id);
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
      code: "wrong_device" | "not_leased" | "terminal" | "invalid_report";
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
  if (job.device_id !== device.id) return { ok: false, code: "wrong_device" };
  if (job.status !== "leased")
    return {
      ok: false,
      code: job.status === "queued" ? "not_leased" : "terminal",
    };
  const output = redactAuditDetail(sanitizeOutput(parsed.data.output));
  const update = await admin
    .from("device_jobs")
    .update({
      status: parsed.data.status,
      result: output,
      snapshot_hash: parsed.data.snapshot?.hash ?? null,
      snapshot_kinds: parsed.data.snapshot?.kinds ?? [],
      error: parsed.data.error ?? null,
      reported_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("device_id", device.id)
    .eq("status", "leased");
  if (update.error) return { ok: false, code: "not_leased" };
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
  const result = await admin
    .from("device_jobs")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .in("status", ["queued", "leased"])
    .lt("expires_at", new Date().toISOString())
    .select("id");
  return { expired: result.data?.length ?? 0 };
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
