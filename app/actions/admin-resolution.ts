"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin/auth";
import { isResolutionCenterEnabled } from "@/lib/admin/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  escalateRun,
  pauseRun,
  resumeRun,
  writeRunEvent,
  type ResolutionRun,
} from "@/lib/autonomy/orchestrator";

type Result = { error: string } | { success: true };
const terminalStatuses = new Set(["resolved", "escalated", "failed"]);

async function context(runId: string) {
  if (!isResolutionCenterEnabled()) return null;
  const session = await getAdminSession();
  if (!session) return null;
  const admin = createAdminClient();
  const result = await admin
    .from("resolution_runs")
    .select("*")
    .eq("organization_id", session.organizationId)
    .eq("id", runId)
    .maybeSingle();
  if (result.error || !result.data) return null;
  return { admin, session, run: result.data as ResolutionRun };
}

function revalidateRun(runId: string): void {
  revalidatePath("/admin/resolution");
  revalidatePath(`/admin/resolution/${runId}`);
}

export async function pauseAiRun(runId: string): Promise<Result> {
  const found = await context(runId);
  if (!found) return { error: "Resolution run not found." };
  if (terminalStatuses.has(found.run.status))
    return { error: "Terminal runs cannot be paused." };
  const updated = await pauseRun(
    found.admin,
    found.run,
    `staff:${found.session.userId}`,
    "staff.pause"
  );
  if (!updated) return { error: "Unable to pause the resolution run." };
  revalidateRun(runId);
  return { success: true };
}

export async function resumeAiRun(runId: string): Promise<Result> {
  const found = await context(runId);
  if (!found || found.session.role !== "org_admin")
    return { error: "Only organization admins can resume runs." };
  const updated = await resumeRun(
    found.admin,
    found.run,
    `staff:${found.session.userId}`
  );
  if (!updated) return { error: "Unable to resume the resolution run." };
  revalidateRun(runId);
  return { success: true };
}

export async function takeOverRun(runId: string): Promise<Result> {
  const found = await context(runId);
  if (!found) return { error: "Resolution run not found." };
  if (terminalStatuses.has(found.run.status))
    return { error: "Terminal runs cannot be taken over." };
  const actor = `staff:${found.session.userId}`;
  const escalated = await escalateRun(found.admin, found.run, "staff_takeover");
  if (!escalated) return { error: "Unable to take over the resolution run." };
  const ticket = await found.admin
    .from("tickets")
    .update({
      assigned_agent_id: found.session.userId,
      assigned_at: new Date().toISOString(),
      assigned_agent: found.session.displayName ?? found.session.email,
      resolver_type: "employee",
      status: "In Progress",
    })
    .eq("organization_id", found.session.organizationId)
    .eq("id", found.run.ticket_id);
  if (ticket.error) return { error: "Unable to assign the ticket." };
  await writeRunEvent(found.admin, {
    organization_id: found.session.organizationId,
    run_id: found.run.id,
    ticket_id: found.run.ticket_id,
    kind: "staff.takeover",
    actor,
    detail: { assignedAgentId: found.session.userId },
  });
  revalidateRun(runId);
  return { success: true };
}

export async function escalateAiRun(runId: string): Promise<Result> {
  const found = await context(runId);
  if (!found) return { error: "Resolution run not found." };
  if (terminalStatuses.has(found.run.status))
    return { error: "Terminal runs cannot be escalated." };
  const actor = `staff:${found.session.userId}`;
  const escalated = await escalateRun(
    found.admin,
    found.run,
    "staff_escalated"
  );
  if (!escalated) return { error: "Unable to escalate the resolution run." };
  await writeRunEvent(found.admin, {
    organization_id: found.session.organizationId,
    run_id: found.run.id,
    ticket_id: found.run.ticket_id,
    kind: "staff.escalate",
    actor,
  });
  revalidateRun(runId);
  return { success: true };
}
