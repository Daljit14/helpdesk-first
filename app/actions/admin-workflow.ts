"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  canAccessTicket,
  getAdminSession,
  recordAudit,
} from "@/lib/admin/auth";
import { isTicketWorkflowEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { humanResponseDue } from "@/lib/tickets/sla";
import { notifyEmployeesOfHandoff } from "@/lib/tickets/notify";

type Result = { error: string } | { success: true };
const id = z.string().uuid();
const message = z.string().trim().min(1).max(4000);
const limiter = new Map<string, { start: number; count: number }>();

async function sessionFor(action: string, ticketId: string) {
  if (!isTicketWorkflowEnabled()) return null;
  const session = await getAdminSession();
  if (!session) return null;
  const key = `${session.userId}:${action}`;
  const current = limiter.get(key);
  if (!current || Date.now() - current.start > 10 * 60_000) {
    limiter.set(key, { start: Date.now(), count: 1 });
  } else if (current.count++ >= 60) {
    return null;
  }
  const { data: ticket } = await createAdminClient()
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!ticket || !canAccessTicket(session, ticket)) return null;
  return { session, ticket };
}

async function writeEvent(
  session: { organizationId: string; userId: string },
  ticketId: string,
  type: string,
  detail: Record<string, unknown> = {}
) {
  await createAdminClient().from("ticket_system_events").insert({
    ticket_id: ticketId,
    organization_id: session.organizationId,
    event_type: type,
    actor_type: "employee",
    actor_id: session.userId,
    detail,
  });
}

async function updateTicket(
  ticketId: string,
  organizationId: string,
  values: Record<string, unknown>
) {
  return createAdminClient()
    .from("tickets")
    .update(values)
    .eq("id", ticketId)
    .eq("organization_id", organizationId)
    .select("id")
    .maybeSingle();
}

export async function claimTicket(ticketId: string): Promise<Result> {
  const found = await sessionFor("claim", ticketId);
  if (!found) return { error: "Ticket not found." };
  if (found.ticket.assigned_agent_id)
    return { error: "Ticket is already assigned." };
  const result = await updateTicket(ticketId, found.session.organizationId, {
    assigned_agent_id: found.session.userId,
    assigned_at: new Date().toISOString(),
    assigned_agent: found.session.displayName ?? found.session.email,
    resolver_type: "employee",
    status: "In Progress",
    first_human_response_at:
      found.ticket.first_human_response_at ?? new Date().toISOString(),
  });
  if (result.error) return { error: "Unable to claim ticket." };
  await writeEvent(found.session, ticketId, "employee.claimed");
  await recordAudit(found.session, "ticket.claim", ticketId);
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true };
}

export async function assignTicket(
  ticketId: string,
  agentUserId: string
): Promise<Result> {
  const found = await sessionFor("assign", ticketId);
  if (!found || found.session.role !== "admin")
    return { error: "Ticket not found." };
  if (!id.safeParse(agentUserId).success) return { error: "Invalid agent." };
  const member = await createAdminClient()
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", found.session.organizationId)
    .eq("user_id", agentUserId)
    .in("role", ["admin", "support_agent"])
    .maybeSingle();
  if (!member.data) return { error: "Invalid agent." };
  const profile = await createAdminClient()
    .from("admin_profiles")
    .select("display_name")
    .eq("user_id", agentUserId)
    .maybeSingle();
  const result = await updateTicket(ticketId, found.session.organizationId, {
    assigned_agent_id: agentUserId,
    assigned_at: new Date().toISOString(),
    assigned_agent: profile.data?.display_name ?? null,
    resolver_type: "employee",
    status: "In Progress",
  });
  if (result.error) return { error: "Unable to assign ticket." };
  await writeEvent(found.session, ticketId, "employee.assigned", {
    agentUserId,
  });
  await recordAudit(found.session, "ticket.assign", ticketId);
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true };
}

export async function changePriority(
  ticketId: string,
  priority: string
): Promise<Result> {
  const found = await sessionFor("priority", ticketId);
  if (!found || !["Low", "Normal", "High", "Urgent"].includes(priority))
    return { error: "Ticket not found." };
  const result = await updateTicket(ticketId, found.session.organizationId, {
    priority,
  });
  if (result.error) return { error: "Unable to update priority." };
  await recordAudit(found.session, "ticket.priority", ticketId);
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true };
}

export async function changeStatus(
  ticketId: string,
  status: string
): Promise<Result> {
  const found = await sessionFor("status", ticketId);
  if (
    !found ||
    !["In Progress", "Waiting for User", "Needs Human"].includes(status)
  )
    return { error: "Invalid status." };
  const values: Record<string, unknown> = { status };
  if (status === "Needs Human") {
    values.needs_human_at =
      found.ticket.needs_human_at ?? new Date().toISOString();
    values.human_response_due_at = humanResponseDue(
      found.ticket.priority,
      new Date()
    ).toISOString();
    values.handoff_reason =
      found.ticket.handoff_reason ?? "employee_requested_human";
  }
  const result = await updateTicket(
    ticketId,
    found.session.organizationId,
    values
  );
  if (result.error) return { error: "Unable to update status." };
  await writeEvent(found.session, ticketId, "status.changed", { status });
  if (status === "Needs Human") {
    await notifyEmployeesOfHandoff(found.session.organizationId, {
      id: ticketId,
      issue_title: found.ticket.issue_title,
      priority: found.ticket.priority,
      human_response_due_at: values.human_response_due_at as string,
    });
  }
  await recordAudit(found.session, "ticket.status", ticketId);
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true };
}

export async function reopenTicket(ticketId: string): Promise<Result> {
  const found = await sessionFor("reopen", ticketId);
  if (!found || !["Resolved", "Closed"].includes(found.ticket.status))
    return { error: "Ticket not found." };
  const result = await updateTicket(ticketId, found.session.organizationId, {
    status: "In Progress",
    verified_by_user: false,
    resolution_source: null,
    resolver_type: found.ticket.assigned_agent_id ? "employee" : "unassigned",
  });
  if (result.error) return { error: "Unable to reopen ticket." };
  await writeEvent(found.session, ticketId, "ticket.reopened");
  await recordAudit(found.session, "ticket.reopen", ticketId);
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true };
}

async function addComment(
  ticketId: string,
  body: string,
  visibility: "public" | "internal",
  action: string
): Promise<Result> {
  const found = await sessionFor(action, ticketId);
  if (!found) return { error: "Ticket not found." };
  const parsed = message.safeParse(body);
  if (!parsed.success) return { error: "Invalid message." };
  const admin = createAdminClient();
  const result = await admin.from("ticket_comments").insert({
    ticket_id: ticketId,
    organization_id: found.session.organizationId,
    author_id: found.session.userId,
    author_type: "employee",
    visibility,
    message: parsed.data,
  });
  if (result.error) return { error: "Unable to add comment." };
  if (visibility === "public") {
    await updateTicket(ticketId, found.session.organizationId, {
      first_human_response_at:
        found.ticket.first_human_response_at ?? new Date().toISOString(),
    });
    if (found.ticket.user_id) {
      try {
        await sendPushToUser(found.ticket.user_id, {
          title: "Your ticket has a new reply",
          body: "Your IT support team replied.",
          url: `/tickets/${ticketId}`,
        });
      } catch (error) {
        console.warn("Unable to notify ticket owner.", error);
      }
    }
  }
  await writeEvent(
    found.session,
    ticketId,
    visibility === "public" ? "comment.created" : "internal_note.created"
  );
  await recordAudit(found.session, `ticket.${action}`, ticketId);
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true };
}

export async function addPublicComment(
  ticketId: string,
  body: string
): Promise<Result> {
  return addComment(ticketId, body, "public", "comment");
}
export async function addInternalNote(
  ticketId: string,
  body: string
): Promise<Result> {
  return addComment(ticketId, body, "internal", "internal_note");
}
export const requestInformation = async (
  ticketId: string,
  body: string
): Promise<Result> => {
  const result = await addPublicComment(ticketId, body);
  if ("error" in result) return result;
  return changeStatus(ticketId, "Waiting for User");
};
export const requestVerification = async (
  ticketId: string,
  body: string
): Promise<Result> => {
  const result = await addPublicComment(ticketId, body);
  if ("error" in result) return result;
  const found = await sessionFor("verification", ticketId);
  if (!found) return { error: "Ticket not found." };
  await updateTicket(ticketId, found.session.organizationId, {
    status: "Pending Verification",
    verification_requested_at: new Date().toISOString(),
  });
  await writeEvent(found.session, ticketId, "verification.requested");
  return { success: true };
};

const resolutionSchema = z.object({
  rootCause: z.string().trim().min(3).max(1000),
  actionsPerformed: z.string().trim().min(3).max(1000),
  toolsUsed: z.string().trim().min(3).max(1000),
  result: z.string().trim().min(3).max(1000),
  verificationMethod: z.enum([
    "user_confirmed",
    "screen_shared",
    "remote_test",
    "other",
  ]),
  userExplanation: z.string().trim().min(3).max(1000),
  preventiveRecommendation: z.string().trim().min(3).max(1000),
});

const actionSchema = z
  .object({
    ticketId: id,
    toolName: z.string().trim().min(1).max(120),
    actionSummary: z.string().trim().min(3).max(1000),
    resultSummary: z.string().trim().min(1).max(1000),
    consentRequired: z.boolean(),
    consentReceived: z.boolean(),
  })
  .strict();

const credentialPattern =
  /password\s*[:=]|passwd|\botp\b|\btoken\s*[:=]|bearer\s+[a-z0-9]|begin (rsa |ec )?private key|mfa code/i;

export async function submitResolution(
  ticketId: string,
  report: unknown
): Promise<Result> {
  const found = await sessionFor("resolution", ticketId);
  if (!found) return { error: "Ticket not found." };
  const parsed = resolutionSchema.safeParse(report);
  if (!parsed.success) return { error: "Complete every resolution field." };
  const result = await updateTicket(ticketId, found.session.organizationId, {
    resolution_report: parsed.data,
    resolution_summary: parsed.data.userExplanation,
    verification_method: parsed.data.verificationMethod,
    resolver_type: "employee",
    status: "Pending Verification",
    verification_requested_at: new Date().toISOString(),
  });
  if (result.error) return { error: "Unable to save resolution." };
  await addPublicComment(ticketId, parsed.data.userExplanation);
  await writeEvent(found.session, ticketId, "verification.requested");
  if (found.ticket.user_id) {
    try {
      await sendPushToUser(found.ticket.user_id, {
        title: "Please confirm your issue is fixed",
        body: "Your IT support team completed a resolution.",
        url: `/tickets/${ticketId}`,
      });
    } catch (error) {
      console.warn("Unable to notify ticket owner.", error);
    }
  }
  await recordAudit(found.session, "ticket.resolve", ticketId);
  revalidatePath(`/admin/tickets/${ticketId}`);
  return { success: true };
}

export async function recordAction(input: {
  ticketId: string;
  toolName: string;
  actionSummary: string;
  resultSummary: string;
  consentRequired: boolean;
  consentReceived: boolean;
}): Promise<Result> {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid action details." };
  const found = await sessionFor("action", parsed.data.ticketId);
  if (!found) return { error: "Ticket not found." };
  if (
    [
      parsed.data.toolName,
      parsed.data.actionSummary,
      parsed.data.resultSummary,
    ].some((value) => credentialPattern.test(value))
  )
    return { error: "Remove credentials from the record." };
  const admin = createAdminClient();
  const result = await admin.from("ticket_actions").insert({
    ticket_id: parsed.data.ticketId,
    organization_id: found.session.organizationId,
    agent_id: found.session.userId,
    tool_name: parsed.data.toolName,
    action_summary: parsed.data.actionSummary,
    result_summary: parsed.data.resultSummary,
    consent_required: parsed.data.consentRequired,
    consent_received: parsed.data.consentReceived,
  });
  if (result.error) return { error: "Unable to record action." };
  await writeEvent(found.session, parsed.data.ticketId, "tool.used");
  await recordAudit(found.session, "ticket.action", parsed.data.ticketId);
  revalidatePath(`/admin/tickets/${parsed.data.ticketId}`);
  return { success: true };
}
