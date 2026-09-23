import { getDeviceAction } from "@/lib/device-agent/catalog";
import {
  enqueueDeviceJob,
  findDeviceForTicket,
} from "@/lib/device-agent/server/jobs";
import type { CapabilityHandler, HandlerResult } from "./types";

function failed(error: string): HandlerResult {
  return { ok: false, output: {}, error };
}

export function deviceHandlers(): CapabilityHandler[] {
  return getDeviceActionList().map((action) => ({
    capabilityId: action.id,
    version: action.version,
    async run(ctx, params) {
      const ticket = await ctx.admin
        .from("tickets")
        .select("platform")
        .eq("id", ctx.ticketId)
        .eq("organization_id", ctx.organizationId)
        .maybeSingle();
      if (ticket.error || !ticket.data) return failed("ticket_not_found");
      const device = await findDeviceForTicket(ctx.admin, {
        organizationId: ctx.organizationId,
        ticketId: ctx.ticketId,
        platform: ticket.data.platform,
      });
      if (!device) return failed("no_active_device");
      const approval = await ctx.admin
        .from("approval_requests")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .eq("run_id", ctx.runId)
        .eq("step_id", ctx.stepId)
        .eq("status", "granted")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const job = await enqueueDeviceJob(ctx.admin, {
        organizationId: ctx.organizationId,
        deviceId: device.id,
        runId: ctx.runId,
        stepId: ctx.stepId,
        executionId: ctx.executionId ?? null,
        approvalRequestId: approval.data?.id ?? null,
        ticketId: ctx.ticketId,
        actionId: action.id,
        actionVersion: action.version,
        parameters: params,
        kind: "action",
        snapshotSpec: action.snapshotSpec,
      });
      return {
        ok: true,
        output: {
          jobId: job.id,
          mode: job.mode,
          status: job.status,
          deviceId: device.id,
        },
      };
    },
  }));
}

function getDeviceActionList() {
  return [
    "device_network_status",
    "device_dns_resolution_test",
    "device_wifi_status",
    "device_vpn_client_status",
    "device_disk_space_check",
    "device_pending_updates_check",
    "device_service_status",
    "device_browser_extensions_list",
    "device_security_tool_status",
    "device_flush_dns",
    "device_reset_network_adapter",
    "device_reset_wifi_profile",
    "device_restart_service",
    "device_cleanup_temp_files",
  ]
    .map((id) => getDeviceAction(id, 1))
    .filter((action) => action !== null);
}
