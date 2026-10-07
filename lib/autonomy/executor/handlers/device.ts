import { DEVICE_ACTIONS } from "@/lib/device-agent/catalog";
import {
  enqueueDeviceJob,
  findDeviceForTicket,
} from "@/lib/device-agent/server/jobs";
import type { CapabilityHandler, HandlerResult } from "./types";

function failed(error: string): HandlerResult {
  return { ok: false, output: {}, error };
}

export function deviceHandlers(): CapabilityHandler[] {
  return DEVICE_ACTIONS.map((action) => ({
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
      const step = await ctx.admin
        .from("resolution_steps")
        .select("detail")
        .eq("id", ctx.stepId)
        .eq("organization_id", ctx.organizationId)
        .eq("run_id", ctx.runId)
        .maybeSingle();
      if (step.error || !step.data) return failed("device_binding_unreadable");
      const detail =
        step.data.detail &&
        typeof step.data.detail === "object" &&
        !Array.isArray(step.data.detail)
          ? (step.data.detail as Record<string, unknown>)
          : null;
      const deviceBinding = detail?.deviceBinding;
      if (
        deviceBinding &&
        typeof deviceBinding === "object" &&
        !Array.isArray(deviceBinding) &&
        typeof (deviceBinding as Record<string, unknown>).deviceId ===
          "string" &&
        (deviceBinding as { deviceId: string }).deviceId !== device.id
      )
        return failed("device_binding_mismatch");
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
