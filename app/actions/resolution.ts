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

type ResolutionActionResult = { error: string };

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
