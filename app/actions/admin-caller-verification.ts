"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  canAccessTicket,
  getAdminSession,
  recordAudit,
} from "@/lib/admin/auth";
import { isStaffVerificationEnabled } from "@/lib/admin/flags";
import { resumeAfterApproval } from "@/lib/autonomy/executor/resume";
import { writeRunEvent, type ResolutionRun } from "@/lib/autonomy/orchestrator";
import { isTerminal } from "@/lib/autonomy/state-machine";
import { loadCallerDirectoryFacts } from "@/lib/identity/risk-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pilotActionLimiter } from "./admin-pilot-limiter";

type ActionResult = { success: true } | { error: string };
const ticketIdSchema = z.string().uuid();
const verificationSchema = z.enum([
  "directory_callback",
  "manager_confirmed",
  "idp_push",
]);
const approvalDecisionSchema = z.enum(["grant", "deny"]);

const actionSummary = {
  directory_callback: "Called back on the directory number",
  manager_confirmed: "Manager confirmed",
  idp_push: "User approved a prompt in our sign-in system",
} as const;

type Session = NonNullable<Awaited<ReturnType<typeof getAdminSession>>>;

function hasStaffRole(session: Session): boolean {
  return (
    session.role === "support_agent" ||
    session.role === "org_admin" ||
    session.isPlatformAdmin
  );
}

async function rateAllowed(session: Session, action: string): Promise<boolean> {
  const result = await pilotActionLimiter.check(
    `org:${session.organizationId}:user:${session.userId}:${action}`
  );
  return result.allowed;
}

async function accessibleTicket(
  admin: ReturnType<typeof createAdminClient>,
  session: Session,
  ticketId: string
) {
  const result = await admin
    .from("tickets")
    .select("id,organization_id,user_id,assigned_agent_id,status")
    .eq("id", ticketId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (result.error || !result.data || !canAccessTicket(session, result.data))
    return null;
  return result.data;
}

export async function recordCallerVerification(
  ticketId: string,
  method: "directory_callback" | "manager_confirmed" | "idp_push"
): Promise<ActionResult> {
  if (!isStaffVerificationEnabled()) return { error: "Not available." };
  const session = await getAdminSession();
  if (!session || !hasStaffRole(session))
    return { error: "Staff access required." };
  const parsedTicketId = ticketIdSchema.safeParse(ticketId);
  const parsedMethod = verificationSchema.safeParse(method);
  if (!parsedTicketId.success || !parsedMethod.success)
    return { error: "Invalid caller verification." };
  if (!(await rateAllowed(session, "caller-verification")))
    return { error: "Too many verification attempts." };

  const admin = createAdminClient();
  const ticket = await accessibleTicket(admin, session, parsedTicketId.data);
  if (!ticket) return { error: "Ticket not found." };
  if (!ticket.user_id) return { error: "Ticket has no requester." };
  if (session.userId === ticket.user_id)
    return { error: "You can't verify yourself." };
  const callerFacts = await loadCallerDirectoryFacts(
    admin,
    session.organizationId,
    ticket.user_id
  );
  if (
    parsedMethod.data === "directory_callback" &&
    !callerFacts?.directoryPhone
  )
    return {
      error:
        "No directory number. Don't use a number from the ticket — escalate instead.",
    };
  const inserted = await admin.from("staff_caller_verifications").insert({
    organization_id: session.organizationId,
    ticket_id: ticket.id,
    subject_user_id: ticket.user_id,
    verified_by: session.userId,
    method: parsedMethod.data,
    privileged: callerFacts?.privileged === true,
  });
  if (inserted.error) return { error: "Unable to record caller verification." };

  const action = await admin.from("ticket_actions").insert({
    ticket_id: ticket.id,
    organization_id: session.organizationId,
    agent_id: session.userId,
    tool_name: "caller_verification",
    action_summary: actionSummary[parsedMethod.data],
    result_summary: "Recorded",
    consent_required: false,
    consent_received: false,
    approval_type: "none",
  });
  if (action.error) return { error: "Unable to record caller verification." };
  await recordAudit(session, "ticket.caller_verified", ticket.id);

  const runResult = await admin
    .from("resolution_runs")
    .select("*")
    .eq("organization_id", session.organizationId)
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const run = runResult.data as ResolutionRun | null;
  if (!runResult.error && run && !isTerminal(run.status)) {
    await writeRunEvent(admin, {
      organization_id: session.organizationId,
      run_id: run.id,
      ticket_id: ticket.id,
      kind: "staff.caller_verified",
      actor: `staff:${session.userId}`,
      detail: { method: parsedMethod.data },
    });
  }
  revalidatePath(`/admin/tickets/${ticket.id}`);
  return { success: true };
}

export async function decideTechnicianApproval(
  requestId: string,
  decision: "grant" | "deny"
): Promise<ActionResult> {
  if (!isStaffVerificationEnabled()) return { error: "Not available." };
  const session = await getAdminSession();
  if (!session || !hasStaffRole(session))
    return { error: "Staff access required." };
  const parsedRequestId = ticketIdSchema.safeParse(requestId);
  const parsedDecision = approvalDecisionSchema.safeParse(decision);
  if (!parsedRequestId.success || !parsedDecision.success)
    return { error: "Invalid technician approval." };
  if (!(await rateAllowed(session, "technician-approval")))
    return { error: "Too many approval attempts." };

  const admin = createAdminClient();
  const approvalResult = await admin
    .from("approval_requests")
    .select("id,organization_id,run_id,ticket_id,type,status,expires_at")
    .eq("id", parsedRequestId.data)
    .eq("organization_id", session.organizationId)
    .eq("type", "technician_approval")
    .eq("status", "requested")
    .maybeSingle();
  const approval = approvalResult.data;
  if (approvalResult.error || !approval)
    return { error: "Technician approval not found." };
  if (!approval.expires_at || Date.parse(approval.expires_at) <= Date.now())
    return { error: "Technician approval expired." };
  const ticket = await accessibleTicket(admin, session, approval.ticket_id);
  if (!ticket) return { error: "Ticket not found." };

  const decidedAt = new Date().toISOString();
  const updated = await admin
    .from("approval_requests")
    .update({
      status: parsedDecision.data === "grant" ? "granted" : "denied",
      decided_by: session.userId,
      decided_by_user_id: session.userId,
      decided_at: decidedAt,
    })
    .eq("id", approval.id)
    .eq("organization_id", session.organizationId)
    .eq("type", "technician_approval")
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data)
    return { error: "Technician approval is no longer pending." };

  const runResult = await admin
    .from("resolution_runs")
    .select("*")
    .eq("organization_id", session.organizationId)
    .eq("id", approval.run_id)
    .eq("ticket_id", ticket.id)
    .maybeSingle();
  if (runResult.error || !runResult.data)
    return { error: "Resolution run not found." };
  await resumeAfterApproval(admin, runResult.data as ResolutionRun, {
    actor: session.userId,
    consent: {
      type: "technician_approval",
      userId: session.userId,
    },
  });
  await recordAudit(session, "ticket.technician_approval", ticket.id);
  revalidatePath(`/admin/tickets/${ticket.id}`);
  revalidatePath("/admin/resolution");
  return { success: true };
}
