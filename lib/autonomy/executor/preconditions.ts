import { ADMIN_DEPARTMENTS } from "../capabilities/types";
import type { HandlerAdmin } from "./handlers/types";
import { ticketPlatformToDevicePlatform } from "@/lib/device-agent/catalog";

export type PreconditionsContext = {
  admin: HandlerAdmin;
  organizationId: string;
  ticketId: string;
  params: Record<string, unknown>;
};

export type Precondition = string | { id: string };

export async function checkPreconditions(
  context: PreconditionsContext,
  preconditions: readonly Precondition[]
): Promise<{ ok: true } | { ok: false; reason: string }> {
  for (const precondition of preconditions) {
    const result = await checkOne(
      context,
      typeof precondition === "string" ? precondition : precondition.id
    );
    if (!result.ok) return result;
  }
  return { ok: true };
}

export async function checkPrecondition(
  context: PreconditionsContext,
  precondition: Precondition
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return checkPreconditions(context, [precondition]);
}

async function checkOne(
  { admin, organizationId, ticketId, params }: PreconditionsContext,
  id: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  switch (id) {
    case "ticket_exists": {
      const result = await admin
        .from("tickets")
        .select("id")
        .eq("id", ticketId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      return result.error || !result.data
        ? { ok: false, reason: id }
        : { ok: true };
    }
    case "question_not_asked": {
      const questionId = params.questionId;
      const result = await admin
        .from("tickets")
        .select("diagnostic_answers")
        .eq("id", ticketId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (result.error || !result.data || typeof questionId !== "string")
        return { ok: false, reason: id };
      const answers = Array.isArray(result.data.diagnostic_answers)
        ? result.data.diagnostic_answers
        : [];
      const asked = answers.some(
        (answer) =>
          answer &&
          typeof answer === "object" &&
          "questionId" in answer &&
          answer.questionId === questionId
      );
      return asked ? { ok: false, reason: id } : { ok: true };
    }
    case "notification_belongs_to_ticket": {
      const result = await admin
        .from("notification_outbox")
        .select("id")
        .eq("id", params.notificationId)
        .eq("ticket_id", ticketId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      return result.error || !result.data
        ? { ok: false, reason: id }
        : { ok: true };
    }
    case "outbox_failed_or_dead": {
      const result = await admin
        .from("notification_outbox")
        .select("status")
        .eq("id", params.notificationId)
        .eq("ticket_id", ticketId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      return result.error ||
        !result.data ||
        !["failed", "dead"].includes(result.data.status)
        ? { ok: false, reason: id }
        : { ok: true };
    }
    case "attachment_belongs_to_ticket": {
      const result = await admin
        .from("ticket_attachments")
        .select("id")
        .eq("id", params.attachmentId)
        .eq("ticket_id", ticketId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      return result.error || !result.data
        ? { ok: false, reason: id }
        : { ok: true };
    }
    case "investigation_exists": {
      const result = await admin
        .from("ticket_investigations")
        .select("ticket_id")
        .eq("ticket_id", ticketId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      return result.error || !result.data
        ? { ok: false, reason: id }
        : { ok: true };
    }
    case "ticket_not_terminal": {
      const result = await admin
        .from("tickets")
        .select("status")
        .eq("id", ticketId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      return result.error ||
        !result.data ||
        ["resolved", "closed"].includes(
          String(result.data.status).toLowerCase()
        )
        ? { ok: false, reason: id }
        : { ok: true };
    }
    case "requester_has_active_device": {
      const ticket = await admin
        .from("tickets")
        .select("platform,user_id")
        .eq("id", ticketId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (ticket.error || !ticket.data)
        return { ok: false, reason: "no_active_device" };
      const ticketData = ticket.data;
      const devices = await admin
        .from("devices_public")
        .select("id,platform")
        .eq("organization_id", organizationId)
        .eq("user_id", ticket.data.user_id)
        .eq("status", "active");
      if (devices.error || !devices.data?.length)
        return { ok: false, reason: "no_active_device" };
      const platform = ticketPlatformToDevicePlatform(ticketData.platform);
      if (
        !platform ||
        !devices.data.some((device) => device.platform === platform)
      )
        return { ok: false, reason: "device_platform_mismatch" };
      return { ok: true };
    }
    case "department_available":
      return typeof params.department === "string" &&
        ADMIN_DEPARTMENTS.includes(
          params.department as (typeof ADMIN_DEPARTMENTS)[number]
        )
        ? { ok: true }
        : { ok: false, reason: id };
    default:
      return { ok: false, reason: `unknown_precondition:${id}` };
  }
}
