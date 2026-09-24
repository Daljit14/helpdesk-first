import type { createAdminClient } from "@/lib/supabase/admin";
import { getDeviceAction } from "@/lib/device-agent/catalog";
import { isRealDeviceJob } from "@/lib/device-agent/server/job-status";
import { resolveDeviceOwnerEmails } from "./device-owner";

type Admin = ReturnType<typeof createAdminClient>;
type Raw = Record<string, unknown>;

export type DeviceShadowRow = {
  source: "device_job" | "shadow_plan";
  id: string;
  runId: string | null;
  deviceId: string;
  hostname: string | null;
  ownerEmail: string | null;
  actionId: string;
  actionVersion: number | null;
  paramsSummary: string;
  wouldHave: string;
  policyDecision: string;
  status: string;
  createdAt: string;
};

function summary(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}).slice(0, 120);
  } catch {
    return "{}";
  }
}

export async function getDeviceShadowActivity(
  admin: Admin,
  organizationId: string,
  opts: {
    runId?: string;
    limit?: number;
    includeNonReal?: boolean;
  } = {}
): Promise<DeviceShadowRow[]> {
  let jobsQuery = admin
    .from("device_jobs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("mode", "shadow")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.runId) jobsQuery = jobsQuery.eq("run_id", opts.runId);
  const jobsResult = await jobsQuery;
  if (jobsResult.error) throw jobsResult.error;
  const plansResult = opts.runId
    ? { data: [], error: null }
    : await admin
        .from("device_shadow_actions")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(opts.limit ?? 50);
  if (plansResult.error) throw plansResult.error;
  const jobs = ((jobsResult.data ?? []) as Raw[]).filter(
    (row) =>
      row.mode === "shadow" &&
      (opts.includeNonReal || isRealDeviceJob({ status: String(row.status) }))
  );
  const plans = (plansResult.data ?? []) as Raw[];
  const all = [
    ...jobs.map((row): DeviceShadowRow => {
      const actionId = String(row.action_id ?? "unknown");
      const action = getDeviceAction(
        actionId as `device_${string}`,
        typeof row.action_version === "number" ? row.action_version : 1
      );
      const result = (row.result ?? {}) as Raw;
      return {
        source: "device_job",
        id: String(row.id),
        runId: typeof row.run_id === "string" ? row.run_id : null,
        deviceId: String(row.device_id),
        hostname: null,
        ownerEmail: null,
        actionId,
        actionVersion:
          typeof row.action_version === "number" ? row.action_version : null,
        paramsSummary: summary(row.parameters),
        wouldHave: action?.description ?? actionId,
        policyDecision:
          typeof result.policy === "string"
            ? result.policy
            : typeof result.decision === "string"
              ? result.decision
              : row.approval_request_id
                ? "consent required"
                : "shadow — no execution",
        status: String(row.status),
        createdAt: String(row.created_at),
      };
    }),
    ...plans.map((row): DeviceShadowRow => {
      const actionId = String(row.action_id ?? "unknown");
      const action = getDeviceAction(
        actionId as `device_${string}`,
        typeof row.action_version === "number" ? row.action_version : 1
      );
      return {
        source: "shadow_plan",
        id: String(row.id),
        runId: null,
        deviceId: String(row.device_id),
        hostname: null,
        ownerEmail: null,
        actionId,
        actionVersion:
          typeof row.action_version === "number" ? row.action_version : null,
        paramsSummary: summary(row.parameters ?? row.reason),
        wouldHave: action?.description ?? actionId,
        policyDecision: String(row.review_status ?? "shadow — no execution"),
        status: String(row.review_status ?? "unreviewed"),
        createdAt: String(row.created_at),
      };
    }),
  ];
  const deviceIds = [...new Set(all.map((row) => row.deviceId))];
  const devices = deviceIds.length
    ? await admin
        .from("devices_public")
        .select("id,hostname,user_id")
        .eq("organization_id", organizationId)
        .in("id", deviceIds)
    : { data: [], error: null };
  if (devices.error) throw devices.error;
  const deviceMap = new Map(
    ((devices.data ?? []) as Raw[]).map((row) => [
      String(row.id),
      {
        hostname: (row.hostname as string | null) ?? null,
        userId: row.user_id,
      },
    ])
  );
  const owners = await resolveDeviceOwnerEmails(
    admin,
    [...deviceMap.values()].map((row) => row.userId as string | null)
  );
  return all.map((row) => {
    const device = deviceMap.get(row.deviceId);
    return {
      ...row,
      hostname: device?.hostname ?? null,
      ownerEmail:
        typeof device?.userId === "string"
          ? (owners.get(device.userId) ?? null)
          : null,
    };
  });
}
