import { createConfiguredAiProvider } from "@/lib/ai/provider-factory";
import { loadFailedSteps } from "@/lib/investigation/load";
import { runInvestigationTurn } from "@/lib/investigation/engine";
import { isInvestigationEnabled } from "@/lib/investigation/config";
import { getApprovedSlugs } from "@/lib/knowledge/governance";
import { getIssueBySlug } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { event } from "@/lib/tickets/events";
import {
  notifyEmployeesOfHandoff,
  notifyRequester,
} from "@/lib/tickets/notify";
import { detectSafetyFlags, routeTicket } from "@/lib/tickets/routing";
import type { Issue } from "@/lib/issues";

export async function triageWorkflowTicket(params: {
  ticketId: string;
  organizationId: string | null;
  userId: string;
  issue: Issue | null;
  message: string;
  platform: string;
  diagnosticAnswers: Array<{
    questionId: string;
    answer: string;
  }>;
  due: string;
}): Promise<void> {
  const {
    ticketId,
    organizationId,
    userId,
    issue,
    message,
    platform,
    diagnosticAnswers,
    due,
  } = params;
  let admin: ReturnType<typeof createAdminClient> | null = null;

  try {
    admin = createAdminClient();
    const allowedSlugs = await getApprovedSlugs(organizationId);
    const failedSteps = isInvestigationEnabled()
      ? await loadFailedSteps(admin, ticketId)
      : [];
    const intake = await runInvestigationTurn({
      input: {
        message,
        platform: platform as never,
        previousAnswers: diagnosticAnswers,
        context: { os: platform },
        failedSteps,
      },
      ticketId,
      organizationId,
      userId,
      provider: createConfiguredAiProvider({ allowedSlugs, organizationId }),
      allowedSlugs,
      admin,
    });
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
      questionCount: diagnosticAnswers.length,
      safetyFlags: detectSafetyFlags(
        [message, ...diagnosticAnswers.map((answer) => answer.answer)].join(" ")
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
    let ticketUpdate = admin.from("tickets").update(update).eq("id", ticketId);
    if (organizationId) {
      ticketUpdate = ticketUpdate.eq("organization_id", organizationId);
    }
    await ticketUpdate;
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
        user_id: userId,
        issue_title: issue?.title ?? "IT support request",
        status: "Needs Human",
      });
      if (organizationId) {
        await notifyEmployeesOfHandoff(organizationId, {
          id: ticketId,
          issue_title: issue?.title ?? "IT support request",
          priority: "Normal",
          human_response_due_at: due,
        });
      }
    }
  } catch (error) {
    console.error("ticket triage failed", error);
    const failureAdmin = admin ?? createAdminClient();
    const failure = {
      status: "Needs Human",
      handoff_reason: "Automatic triage failed.",
      needs_human_at: new Date().toISOString(),
      escalated: true,
      resolver_type: "unassigned",
    };
    let ticketUpdate = failureAdmin
      .from("tickets")
      .update(failure)
      .eq("id", ticketId);
    if (organizationId) {
      ticketUpdate = ticketUpdate.eq("organization_id", organizationId);
    }
    await ticketUpdate;
    await event(ticketId, organizationId, "ai.escalated", "ai", null, {
      reason: "Automatic triage failed.",
    });
    if (organizationId) {
      await notifyEmployeesOfHandoff(organizationId, {
        id: ticketId,
        issue_title: issue?.title ?? "IT support request",
        priority: "Normal",
        human_response_due_at: due,
      });
    }
  }
}
