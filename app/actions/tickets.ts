"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createConfiguredAiProvider } from "@/lib/ai/provider-factory";
import { processAiIntake } from "@/lib/ai/intake";
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
import { detectSafetyFlags, routeTicket } from "@/lib/tickets/routing";
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
import { getApprovedSlugs } from "@/lib/knowledge/governance";
import { attachTicketAttachments } from "@/lib/attachments/server";
import { resolveOrganizationForUser } from "@/lib/org/membership";

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

async function event(
  ticketId: string,
  organizationId: string,
  eventType: string,
  actorType: "user" | "ai" | "employee" | "system",
  actorId: string | null,
  detail: Record<string, unknown> = {}
) {
  await createAdminClient().from("ticket_system_events").insert({
    ticket_id: ticketId,
    organization_id: organizationId,
    event_type: eventType,
    actor_type: actorType,
    actor_id: actorId,
    detail,
  });
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

  const allowedSlugs = await getApprovedSlugs(organizationId);
  const intake = await processAiIntake(
    {
      message: parsed.data.message,
      platform: parsed.data.platform as never,
      previousAnswers: parsed.data.diagnosticAnswers,
    },
    {
      provider: createConfiguredAiProvider({
        allowedSlugs,
        organizationId,
      }),
      allowedSlugs,
    }
  );
  const output =
    intake.status === "success"
      ? {
          ...intake.output,
          confidence:
            intake.output.confidence ??
            (intake.output.decision === "match" ? 0.9 : 0.4),
        }
      : {
          decision: "escalate" as const,
          escalationReason: intake.reason,
          confidence: 0,
        };
  const matched = output.matchedIssueSlug
    ? (getIssueBySlug(output.matchedIssueSlug) ?? null)
    : null;
  if (
    output.decision === "match" &&
    output.matchedIssueSlug &&
    !allowedSlugs.includes(output.matchedIssueSlug)
  ) {
    output.decision = "escalate";
    output.matchedIssueSlug = undefined;
    output.escalationReason = "No approved guide is available.";
  }
  const decision = routeTicket({
    ai: output,
    issue: matched,
    userRequestedHuman: false,
    failedAttempts: 0,
    questionCount: parsed.data.diagnosticAnswers.length,
    safetyFlags: detectSafetyFlags(
      [
        parsed.data.message,
        ...parsed.data.diagnosticAnswers.map((a) => a.answer),
      ].join(" ")
    ),
  });
  const update =
    decision.resolver === "ai"
      ? {
          status: "AI Resolving",
          resolver_type: "ai",
          ai_attempted: true,
          ai_attempted_at: new Date().toISOString(),
          ai_confidence: decision.confidence,
          ai_risk_level: decision.riskLevel,
          ai_recommended_issue_id: decision.issueId,
        }
      : {
          status: "Needs Human",
          resolver_type: "unassigned",
          handoff_reason: decision.reason,
          needs_human_at: new Date().toISOString(),
          escalated: true,
        };
  await admin
    .from("tickets")
    .update(update)
    .eq("id", ticketId)
    .eq("organization_id", organizationId);
  if (decision.resolver === "ai") {
    await event(ticketId, organizationId, "ai.assigned", "ai", null, {
      issueId: decision.issueId,
    });
    await event(ticketId, organizationId, "ai.solution_offered", "ai", null);
    await admin.from("ticket_comments").insert({
      ticket_id: ticketId,
      organization_id: organizationId,
      author_type: "ai",
      visibility: "public",
      message: `I found an approved guide: ${matched?.title ?? "the recommended guide"}.`,
    });
  } else {
    await event(ticketId, organizationId, "ai.escalated", "ai", null, {
      reason: decision.reason,
    });
    await notifyRequester("ticket.handoff", {
      id: ticketId,
      user_id: user.id,
      issue_title: issue?.title ?? "IT support request",
      status: "Needs Human",
    });
    await notifyEmployeesOfHandoff(organizationId, {
      id: ticketId,
      issue_title: issue?.title ?? "IT support request",
      priority: "Normal",
      human_response_due_at: due,
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
    await notifyEmployeesOfHandoff(ticket.organization_id, {
      id: ticketId,
      issue_title: ticket.issue_title,
      priority: ticket.priority,
      human_response_due_at: ticket.human_response_due_at,
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
  const supabase = await createClient();
  const { error } = await supabase.from("ticket_comments").insert({
    ticket_id: ticketId,
    author_id: user.id,
    author_type: "user",
    visibility: "public",
    message: body.data,
  });
  if (error) return { error: "Unable to add comment." };
  const admin = createAdminClient();
  const ticket = await admin
    .from("tickets")
    .select("organization_id,issue_title,assigned_agent_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (ticket.data)
    await event(
      ticketId,
      ticket.data.organization_id,
      "comment.created",
      "user",
      user.id
    );
  if (ticket.data) {
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
  }
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
