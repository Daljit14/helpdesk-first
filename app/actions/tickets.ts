"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import {
  isSecureAttachmentsEnabled,
  isTicketWorkflowEnabled,
  isUserPortalEnabled,
} from "@/lib/admin/flags";
import { getIssueBySlug } from "@/lib/search";
import {
  getSlaTargets,
  humanResponseDue,
  resolutionDue,
} from "@/lib/tickets/sla";
import {
  notifyEmployeesOfHandoff,
  notifyRequester,
  notifyAssignedStaff,
} from "@/lib/tickets/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/user";
import { platforms } from "@/lib/helpdesk-data";
import { MemoryRateLimiter } from "@/lib/ai/rate-limit";
import { attachTicketAttachments } from "@/lib/attachments/server";
import { resolveOrganizationForUser } from "@/lib/org/membership";
import { event } from "@/lib/tickets/events";
import { triageWorkflowTicket } from "@/lib/tickets/triage";
import { isEscalationPackageEnabled } from "@/lib/investigation/config";
import {
  snapshotEscalationPackage,
  summarizeEscalationPackage,
} from "@/lib/investigation/escalation";

type Result = { error: string } | { success: true; ticketId?: string };
const limiter = new MemoryRateLimiter({
  windowMs: 10 * 60_000,
  maxRequests: 20,
});
const inputSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  platform: z.string().trim().max(40),
  issueId: z.string().trim().min(1).optional(),
  diagnosticAnswers: z
    .array(z.object({ questionId: z.string(), answer: z.string().max(500) }))
    .max(8)
    .default([]),
  attachmentIds: z.array(z.string().uuid()).max(50).default([]),
  attachmentPath: z.string().trim().min(1).optional(),
});
const ticketIdSchema = z.string().uuid();

async function authorized(action: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  const rate = await limiter.check(`ticket:${action}:${user.id}`);
  return rate.allowed ? user : null;
}

export async function createWorkflowTicket(input: unknown): Promise<Result> {
  if (!isTicketWorkflowEnabled()) return { error: "Not available." };
  const user = await authorized("create");
  if (!user) return { error: "Not authorized." };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || !platforms.includes(parsed.data.platform as never)) {
    return { error: "Invalid ticket details." };
  }
  const issue = parsed.data.issueId
    ? getIssueBySlug(parsed.data.issueId)
    : null;
  const admin = createAdminClient();
  const { organizationId } = await resolveOrganizationForUser(user.id);
  const slaTargets = await getSlaTargets(organizationId);
  const createdAt = new Date();
  const due = humanResponseDue("Normal", createdAt, slaTargets).toISOString();
  const resolutionDueAt = resolutionDue(
    "Normal",
    createdAt,
    slaTargets
  ).toISOString();
  const inserted = await admin
    .from("tickets")
    .insert({
      user_id: user.id,
      organization_id: organizationId,
      issue_id: issue?.id ?? "workflow-intake",
      issue_title: issue?.title ?? "IT support request",
      category: issue?.category ?? "Other",
      platform: parsed.data.platform,
      message: parsed.data.message,
      diagnostic_answers: parsed.data.diagnosticAnswers,
      attachment_path:
        !isSecureAttachmentsEnabled() &&
        parsed.data.attachmentPath?.startsWith(`${user.id}/`) &&
        !parsed.data.attachmentPath.includes("..")
          ? parsed.data.attachmentPath
          : null,
      status: "AI Reviewing",
      resolver_type: "unassigned",
      human_response_due_at: due,
      resolution_due_at: resolutionDueAt,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data)
    return { error: "Unable to submit ticket." };
  const ticketId = inserted.data.id;
  if (isSecureAttachmentsEnabled()) {
    const attached = await attachTicketAttachments(
      ticketId,
      parsed.data.attachmentIds
    );
    if ("error" in attached) return { error: attached.error };
  }
  await event(ticketId, organizationId, "ticket.created", "user", user.id);

  const createdTicketSummary = {
    id: ticketId,
    user_id: user.id,
    issue_title: issue?.title ?? "IT support request",
    status: "AI Reviewing",
  };
  await notifyRequester("ticket.created", createdTicketSummary, {
    status: "New",
  });

  try {
    after(() =>
      triageWorkflowTicket({
        ticketId,
        organizationId,
        userId: user.id,
        issue: issue ?? null,
        message: parsed.data.message,
        platform: parsed.data.platform,
        diagnosticAnswers: parsed.data.diagnosticAnswers,
        due,
      })
    );
  } catch {
    void triageWorkflowTicket({
      ticketId,
      organizationId,
      userId: user.id,
      issue: issue ?? null,
      message: parsed.data.message,
      platform: parsed.data.platform,
      diagnosticAnswers: parsed.data.diagnosticAnswers,
      due,
    });
  }
  revalidatePath("/tickets");
  return { success: true, ticketId };
}

export async function requestHuman(
  ticketId: string,
  reason: string
): Promise<Result> {
  if (!isTicketWorkflowEnabled()) return { error: "Not available." };
  const user = await authorized("request-human");
  if (!user || !ticketIdSchema.safeParse(ticketId).success)
    return { error: "Not authorized." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("handoff_ticket", {
    ticket: ticketId,
    reason: reason.trim().slice(0, 1000),
    handoff: "user_requested_human",
  });
  if (error) return { error: "Unable to request human support." };
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select(
      "id,organization_id,issue_title,priority,human_response_due_at,user_id"
    )
    .eq("id", ticketId)
    .maybeSingle();
  if (ticket) {
    const packageSnapshot =
      isEscalationPackageEnabled() && ticket.organization_id
        ? await snapshotEscalationPackage(
            admin,
            ticketId,
            ticket.organization_id
          )
        : null;
    await notifyEmployeesOfHandoff(ticket.organization_id, {
      id: ticketId,
      issue_title: ticket.issue_title,
      priority: ticket.priority,
      human_response_due_at: ticket.human_response_due_at,
      diagnosis: packageSnapshot
        ? summarizeEscalationPackage(packageSnapshot)
        : undefined,
    });
  }
  revalidatePath(`/tickets/${ticketId}`);
  return { success: true };
}

const stepOutcomeSchema = z.object({
  ticketId: ticketIdSchema,
  guideSlug: z.string().trim().min(1).max(120),
  stepIndex: z.number().int().min(0).max(99),
  outcome: z.enum(["worked", "failed", "could_not_perform"]),
});

export async function recordStepOutcome(
  ticketId: string,
  guideSlug: string,
  stepIndex: number,
  outcome: "worked" | "failed" | "could_not_perform"
): Promise<Result> {
  if (!isTicketWorkflowEnabled()) return { error: "Not available." };
  const user = await authorized("step-outcome");
  const parsed = stepOutcomeSchema.safeParse({
    ticketId,
    guideSlug,
    stepIndex,
    outcome,
  });
  if (!user || !parsed.success) return { error: "Invalid step outcome." };
  const { error } = await (
    await createClient()
  ).rpc("record_step_outcome", {
    ticket: parsed.data.ticketId,
    guide: parsed.data.guideSlug,
    step: parsed.data.stepIndex,
    result: parsed.data.outcome,
  });
  if (error) return { error: "Unable to record step outcome." };
  revalidatePath(`/tickets/${ticketId}`);
  return { success: true };
}

export async function addUserComment(
  ticketId: string,
  message: string
): Promise<Result> {
  if (!isTicketWorkflowEnabled()) return { error: "Not available." };
  const user = await authorized("comment");
  if (!user || !ticketIdSchema.safeParse(ticketId).success)
    return { error: "Not authorized." };
  const body = z.string().trim().min(1).max(4000).safeParse(message);
  if (!body.success) return { error: "Invalid comment." };
  const admin = createAdminClient();
  const ticket = await admin
    .from("tickets")
    .select("id,organization_id,issue_title,assigned_agent_id")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ticket.data) return { error: "Ticket not found." };
  const supabase = await createClient();
  const { error } = await supabase.from("ticket_comments").insert({
    ticket_id: ticketId,
    organization_id: ticket.data.organization_id,
    author_id: user.id,
    author_type: "user",
    visibility: "public",
    message: body.data,
  });
  if (error) return { error: "Unable to add comment." };
  await event(
    ticketId,
    ticket.data.organization_id,
    "comment.created",
    "user",
    user.id,
    { preview: body.data.slice(0, 80) }
  );
  const ticketRow = {
    id: ticketId,
    user_id: user.id,
    organization_id: ticket.data.organization_id,
    issue_title: ticket.data.issue_title ?? "IT support request",
    assigned_agent_id: ticket.data.assigned_agent_id ?? null,
  };
  await notifyAssignedStaff("reply.public", ticketRow, {
    publicReplyExcerpt: body.data,
  });
  revalidatePath(`/tickets/${ticketId}`);
  return { success: true };
}

export async function verifyTicket(
  ticketId: string,
  confirmed: boolean
): Promise<Result> {
  if (!isTicketWorkflowEnabled()) return { error: "Not available." };
  const user = await authorized("verify");
  if (!user || !ticketIdSchema.safeParse(ticketId).success)
    return { error: "Not authorized." };
  const { error } = await (
    await createClient()
  ).rpc("user_verify_ticket", {
    ticket: ticketId,
    confirmed,
  });
  if (error) return { error: "Unable to update ticket." };
  if (confirmed) {
    const { data: ticket } = await createAdminClient()
      .from("tickets")
      .select("id,user_id,organization_id,issue_title,assigned_agent_id,status")
      .eq("id", ticketId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (ticket) {
      await notifyRequester("ticket.resolved", ticket);
      await notifyAssignedStaff("ticket.resolved", ticket);
    }
  }
  revalidatePath(`/tickets/${ticketId}`);
  return { success: true };
}

function portalAvailable() {
  return isTicketWorkflowEnabled() && isUserPortalEnabled();
}

export async function reopenTicketByUser(
  ticketId: string,
  reason: string
): Promise<Result> {
  if (!portalAvailable()) return { error: "Not available." };
  const user = await authorized("reopen");
  if (!user || !ticketIdSchema.safeParse(ticketId).success) {
    return { error: "Not authorized." };
  }
  const parsedReason = z.string().trim().min(1).max(1000).safeParse(reason);
  if (!parsedReason.success) return { error: "Please provide a reason." };
  const { error } = await (
    await createClient()
  ).rpc("user_reopen_ticket", {
    ticket: ticketId,
    reason: parsedReason.data,
  });
  if (error) {
    return {
      error: error.message.includes("reopen window")
        ? "This ticket can no longer be reopened. Please submit a new ticket."
        : "Unable to reopen ticket.",
    };
  }
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select(
      "id,organization_id,issue_title,priority,human_response_due_at,user_id"
    )
    .eq("id", ticketId)
    .maybeSingle();
  if (ticket) {
    await event(
      ticketId,
      ticket.organization_id,
      "ticket.reopened",
      "user",
      user.id,
      {
        reason: parsedReason.data,
      }
    );
    await notifyRequester("ticket.reopened", ticket, { status: "Reopened" });
    await notifyEmployeesOfHandoff(ticket.organization_id, {
      id: ticketId,
      issue_title: ticket.issue_title,
      priority: ticket.priority,
      human_response_due_at: ticket.human_response_due_at,
    });
  }
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
  return { success: true };
}

export async function rateTicket(
  ticketId: string,
  rating: number,
  comment: string
): Promise<Result> {
  if (!portalAvailable()) return { error: "Not available." };
  const user = await authorized("rate");
  if (!user || !ticketIdSchema.safeParse(ticketId).success) {
    return { error: "Not authorized." };
  }
  const parsedRating = z.number().int().min(1).max(5).safeParse(rating);
  const parsedComment = z.string().max(500).safeParse(comment);
  if (!parsedRating.success || !parsedComment.success) {
    return { error: "Invalid rating." };
  }
  const { error } = await (
    await createClient()
  ).rpc("user_rate_ticket", {
    ticket: ticketId,
    rating: parsedRating.data,
    comment: parsedComment.data,
  });
  if (error) return { error: "Unable to save rating." };
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select("organization_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (ticket) {
    await event(
      ticketId,
      ticket.organization_id,
      "ticket.rated",
      "user",
      user.id,
      {
        rating: parsedRating.data,
      }
    );
  }
  revalidatePath(`/tickets/${ticketId}`);
  return { success: true };
}

export async function rejectAiSolution(
  ticketId: string,
  note: string
): Promise<Result> {
  if (!portalAvailable()) return { error: "Not available." };
  const user = await authorized("reject-solution");
  if (!user || !ticketIdSchema.safeParse(ticketId).success) {
    return { error: "Not authorized." };
  }
  const parsedNote = z.string().trim().max(1000).safeParse(note);
  if (!parsedNote.success) return { error: "Invalid note." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_ai_attempt_failed", {
    ticket: ticketId,
  });
  if (error) return { error: "Unable to update ticket." };
  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select("organization_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (parsedNote.data) {
    const { error: commentError } = await supabase
      .from("ticket_comments")
      .insert({
        ticket_id: ticketId,
        organization_id: ticket?.organization_id,
        author_id: user.id,
        author_type: "user",
        visibility: "public",
        message: `Didn't work: ${parsedNote.data}`,
      });
    if (commentError) return { error: "Unable to add comment." };
  }
  if (ticket) {
    await event(
      ticketId,
      ticket.organization_id,
      "solution.rejected",
      "user",
      user.id
    );
  }
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  return { success: true };
}
