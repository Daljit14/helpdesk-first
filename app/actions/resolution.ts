"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getIssueBySlug } from "@/lib/search";
import { normalizePlatform } from "@/lib/operations/transform";
import { recordAnalyticsEvent } from "@/lib/analytics/events";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/user";
import {
  isResolutionTrackingEnabled,
  isTicketWorkflowEnabled,
} from "@/lib/admin/flags";
import { completeUserHandoff } from "@/lib/tickets/handoff";
import { createAdminClient } from "@/lib/supabase/admin";
import { resumeAfterApproval } from "@/lib/autonomy/executor/resume";

type ResolutionActionResult = { error: string };

export async function respondToAiConsent(
  requestId: string,
  decision: "grant" | "deny"
): Promise<{ success: true } | ResolutionActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  const request = await createAdminClient()
    .from("approval_requests")
    .select("id,organization_id,run_id,ticket_id,type,status,expires_at")
    .eq("id", requestId)
    .maybeSingle();
  if (request.error || !request.data || request.data.type !== "user_consent")
    return { error: "Consent request not found." };
  const ticket = await createAdminClient()
    .from("tickets")
    .select("user_id,organization_id")
    .eq("id", request.data.ticket_id)
    .eq("organization_id", request.data.organization_id)
    .maybeSingle();
  if (
    ticket.error ||
    ticket.data?.user_id !== user.id ||
    ticket.data.organization_id !== request.data.organization_id
  ) {
    return { error: "Consent request not found." };
  }
  if (
    request.data.status !== "requested" ||
    (request.data.expires_at &&
      new Date(request.data.expires_at).getTime() <= Date.now())
  ) {
    return { error: "This consent request has expired." };
  }
  const admin = createAdminClient();
  const updated = await admin
    .from("approval_requests")
    .update({
      status: decision === "grant" ? "granted" : "denied",
      decided_by: user.id,
      decided_by_user_id: user.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", request.data.id)
    .eq("organization_id", request.data.organization_id)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data)
    return { error: "Consent request is no longer available." };
  if (decision === "grant") {
    const run = await admin
      .from("resolution_runs")
      .select("*")
      .eq("id", request.data.run_id)
      .eq("organization_id", request.data.organization_id)
      .eq("ticket_id", request.data.ticket_id)
      .maybeSingle();
    if (run.data)
      await resumeAfterApproval(admin, run.data, { actor: user.id });
  }
  revalidatePath(`/tickets/${request.data.ticket_id}`);
  return { success: true };
}

function canonicalPlatform(raw: string): string | null {
  const value = normalizePlatform(raw === "Mac" ? "macOS" : raw);
  return value === "Other" && raw !== "Other" ? null : value;
}

export async function startAiTicket(input: {
  issueId: string;
  platform: string;
  message?: string;
  diagnosticAnswers?: Array<{ questionId: string; answer: string }>;
}): Promise<{ ticketId: string } | ResolutionActionResult> {
  if (process.env.HELP_DESK_TICKET_WORKFLOW_ENABLED === "true") {
    const { createWorkflowTicket } = await import("@/app/actions/tickets");
    const issue = getIssueBySlug(input.issueId);
    const result = await createWorkflowTicket({
      issueId: input.issueId,
      platform: input.platform,
      message:
        input.message?.trim().slice(0, 2000) ||
        `I need help with the "${issue?.title ?? "IT issue"}" problem.`,
      diagnosticAnswers: (input.diagnosticAnswers ?? [])
        .slice(0, 8)
        .map(({ questionId, answer }) => ({
          questionId,
          answer: answer.slice(0, 500),
        })),
    });
    return "ticketId" in result && result.ticketId
      ? { ticketId: result.ticketId }
      : { error: "error" in result ? result.error : "Unable to start ticket." };
  }
  if (!isResolutionTrackingEnabled()) return { error: "Not available." };
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };
  const issue = getIssueBySlug(input.issueId);
  const platform = canonicalPlatform(input.platform);
  if (!issue || !platform) return { error: "Invalid ticket details." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .insert({
      user_id: user.id,
      issue_id: issue.id,
      issue_title: issue.title,
      category: issue.category,
      platform,
      message: `Assistant recommended the "${issue.title}" guide.`,
      status: "In Progress",
      ai_attempted: true,
      ai_attempted_at: new Date().toISOString(),
      ai_recommended_issue_id: issue.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Unable to start ticket." };

  await recordAnalyticsEvent({
    eventType: "ticket_created",
    path: `/issues/${issue.id}`,
    issueId: issue.id,
    visitorKey: "server",
    platform,
  });
  revalidatePath("/tickets");
  return { ticketId: data.id };
}

const ticketIdSchema = z.string().uuid();

export async function confirmTicketResolved(
  ticketId: string
): Promise<{ success: true } | ResolutionActionResult> {
  if (!isResolutionTrackingEnabled()) return { error: "Not available." };
  const parsed = ticketIdSchema.safeParse(ticketId);
  if (!parsed.success) return { error: "Invalid ticket." };
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_ticket_resolved", {
    ticket: parsed.data,
  });
  if (error) return { error: "Unable to update ticket." };
  revalidatePath("/tickets");
  return { success: true };
}

export async function escalateTicket(
  ticketId: string,
  reason: string
): Promise<{ success: true } | ResolutionActionResult> {
  if (!isResolutionTrackingEnabled()) return { error: "Not available." };
  const parsed = ticketIdSchema.safeParse(ticketId);
  if (!parsed.success) return { error: "Invalid ticket." };
  const user = await getCurrentUser();
  if (!user) return { error: "Not authorized." };

  const supabase = await createClient();
  const trimmedReason = reason.trim().slice(0, 1000);
  const { error } = await supabase.rpc("escalate_ticket", {
    ticket: parsed.data,
    reason: trimmedReason,
  });
  if (error) return { error: "Unable to escalate ticket." };
  if (isTicketWorkflowEnabled()) {
    const { error: handoffError } = await supabase.rpc("handoff_ticket", {
      ticket: parsed.data,
      reason: trimmedReason,
      handoff: "user_requested_human",
    });
    if (handoffError) {
      console.error("Unable to complete workflow handoff.", handoffError);
    } else {
      await completeUserHandoff(parsed.data);
    }
  }
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${parsed.data}`);
  return { success: true };
}
