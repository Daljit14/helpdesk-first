import { getIssueBySlug } from "@/lib/search";
import { getIssueStepPolicies } from "@/lib/investigation/policy";
import { decryptAgentText } from "@/lib/security/ticket-crypto";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import type { createAdminClient } from "@/lib/supabase/admin";
import { writeStep } from "./session";
import type { AgentSession } from "./types";
import { sanitizeForUser } from "./untrusted";

type Admin = ReturnType<typeof createAdminClient>;

function detailsFromParamsHash(paramsHash: string | null) {
  const match = /^([a-z0-9-]{1,80})#(\d+)$/.exec(paramsHash ?? "");
  if (!match) return null;
  const stepIndex = Number(match[2]);
  if (!Number.isSafeInteger(stepIndex) || stepIndex < 0) return null;
  const issue = getIssueBySlug(match[1]);
  const instruction = issue && getIssueStepPolicies(issue)[stepIndex]?.text;
  return issue && instruction ? { issue, instruction, stepIndex } : null;
}

async function whyForOffer(
  admin: Admin,
  session: AgentSession,
  resultSummary: string | null
): Promise<string> {
  const summary = await decryptAgentText(
    admin,
    session.organization_id,
    "agent_steps",
    "result_summary",
    resultSummary
  );
  try {
    const parsed = JSON.parse(summary ?? "") as { why?: unknown };
    return typeof parsed.why === "string"
      ? sanitizeForUser(parsed.why).slice(0, 200)
      : "";
  } catch {
    return "";
  }
}

export async function sweepPendingUserSteps(
  admin: Admin,
  now = new Date()
): Promise<{ sessionsScanned: number; stepsSaved: number; failed: number }> {
  const cutoff = new Date(now.getTime() - 30 * 60_000).toISOString();
  const stepWindowStart = new Date(
    now.getTime() - 7 * 24 * 60 * 60_000
  ).toISOString();
  const offeredResult = await admin
    .from("agent_steps")
    .select("session_id")
    .eq("kind", "user_step_offered")
    .lt("created_at", cutoff)
    .gte("created_at", stepWindowStart)
    .order("created_at", { ascending: true })
    .limit(200);
  if (offeredResult.error) throw new Error("user_step_offer_sweep_failed");
  const sessionIds = [
    ...new Set(
      (offeredResult.data ?? [])
        .map((step) => step.session_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];
  if (sessionIds.length === 0)
    return { sessionsScanned: 0, stepsSaved: 0, failed: 0 };

  const sessionResult = await admin
    .from("agent_sessions")
    .select("*")
    .eq("status", "active")
    .lt("updated_at", cutoff)
    .in("id", sessionIds)
    .order("updated_at", { ascending: true });
  if (sessionResult.error) throw new Error("user_step_session_sweep_failed");
  const sessions = (sessionResult.data ?? []) as AgentSession[];
  let stepsSaved = 0;
  let failed = 0;

  for (const session of sessions) {
    const stepsResult = await admin
      .from("agent_steps")
      .select("id,kind,params_hash,result_summary,created_at")
      .eq("organization_id", session.organization_id)
      .eq("session_id", session.id)
      .in("kind", ["user_step_offered", "user_step_outcome", "user_step_saved"])
      .order("seq", { ascending: true })
      .limit(100);
    if (stepsResult.error) {
      failed += 1;
      continue;
    }
    const steps = stepsResult.data ?? [];
    const answered = new Set(
      steps
        .filter((step) => step.kind === "user_step_outcome")
        .map((step) => step.params_hash)
    );
    const saved = new Set(
      steps
        .filter((step) => step.kind === "user_step_saved")
        .map((step) => step.params_hash)
    );

    for (const offer of steps.filter(
      (step) => step.kind === "user_step_offered"
    )) {
      if (answered.has(offer.id) || saved.has(offer.id)) continue;
      const details = detailsFromParamsHash(offer.params_hash);
      if (!details) {
        failed += 1;
        continue;
      }
      try {
        const savedId = await writeStep(admin, session, {
          kind: "user_step_saved",
          paramsHash: offer.id,
          resultSummary: "pending",
        });
        if (!savedId) {
          failed += 1;
          continue;
        }
        stepsSaved += 1;

        if (session.backing_ticket_id) {
          const action = await admin.from("ticket_actions").insert({
            ticket_id: session.backing_ticket_id,
            organization_id: session.organization_id,
            agent_id: null,
            tool_name: "user_step",
            action_summary:
              `Your step: ${details.instruction} — Source: ${details.issue.title}`.slice(
                0,
                1000
              ),
            result_summary: "Not done before the session ended",
            approval_type: "none",
            consent_required: false,
            consent_received: false,
            created_at: offer.created_at,
          });
          if (action.error) failed += 1;
        }

        const why = await whyForOffer(admin, session, offer.result_summary);
        await enqueueNotification({
          organizationId: session.organization_id,
          ticketId: session.backing_ticket_id ?? null,
          eventType: "agent.user_step_pending",
          recipientUserIds: [session.requester_id],
          subject: "A step to try from your support chat",
          body: `${details.instruction}\n\n${why}\n\n${details.issue.title}`,
          url: session.backing_ticket_id
            ? `/tickets/${session.backing_ticket_id}`
            : "/assistant",
          dedupeKey: `user-step:${offer.id}`,
        });
      } catch {
        failed += 1;
      }
    }
  }

  return { sessionsScanned: sessions.length, stepsSaved, failed };
}
