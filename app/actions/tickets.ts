"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAiProvider } from "@/lib/ai/mock-provider";
import { processAiIntake } from "@/lib/ai/intake";
import { isTicketWorkflowEnabled } from "@/lib/admin/flags";
import { getIssueBySlug } from "@/lib/search";
import { humanResponseDue } from "@/lib/tickets/sla";
import { detectSafetyFlags, routeTicket } from "@/lib/tickets/routing";
import { notifyEmployeesOfHandoff } from "@/lib/tickets/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/user";
import { platforms } from "@/lib/helpdesk-data";
import { MemoryRateLimiter } from "@/lib/ai/rate-limit";

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
  const organizationId =
    (
      await admin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle()
    ).data?.organization_id ?? "00000000-0000-0000-0000-000000000001";
  const due = humanResponseDue("Normal", new Date()).toISOString();
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
      status: "AI Reviewing",
      resolver_type: "unassigned",
      human_response_due_at: due,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data)
    return { error: "Unable to submit ticket." };
  const ticketId = inserted.data.id;
  await event(ticketId, organizationId, "ticket.created", "user", user.id);

  const intake = await processAiIntake(
    {
      message: parsed.data.message,
      platform: parsed.data.platform as never,
      previousAnswers: parsed.data.diagnosticAnswers,
    },
    { provider: createAiProvider() }
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
    .select("organization_id,issue_title,priority,human_response_due_at")
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

export async function reportAiStepFailed(ticketId: string): Promise<Result> {
  if (!isTicketWorkflowEnabled()) return { error: "Not available." };
  const user = await authorized("step-failed");
  if (!user || !ticketIdSchema.safeParse(ticketId).success)
    return { error: "Not authorized." };
  const { error } = await (
    await createClient()
  ).rpc("record_ai_attempt_failed", { ticket: ticketId });
  if (error) return { error: "Unable to update ticket." };
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
    .select("organization_id")
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
