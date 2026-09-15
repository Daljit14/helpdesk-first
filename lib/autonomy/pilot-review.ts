import { createAdminClient } from "@/lib/supabase/admin";
import { alertSecurityEvent } from "./alerts";
import { isAutonomousExecutionEnabled } from "./config";
import { setKillSwitch } from "./kill-switches";
import { writeRunEvent, type ResolutionRun } from "./orchestrator";
import type { CapabilityDefinition } from "./capabilities/types";

type PilotAdmin = ReturnType<typeof createAdminClient>;

export type PilotReviewStatus =
  "pending" | "confirmed" | "incorrect" | "unsafe";

export async function createPilotReview(
  admin: PilotAdmin,
  run: ResolutionRun,
  capability: CapabilityDefinition | null
): Promise<void> {
  if (!isAutonomousExecutionEnabled()) return;
  try {
    await admin.from("pilot_reviews").insert({
      organization_id: run.organization_id,
      run_id: run.id,
      ticket_id: run.ticket_id,
      capability_id: capability?.id ?? null,
      capability_version: capability?.version ?? null,
      resolved_at: new Date().toISOString(),
      review_status: "pending",
      review_source: "admin",
    });
  } catch (error) {
    console.error("Unable to create pilot review.", error);
  }
}

export async function reviewPilotResolution(
  admin: PilotAdmin,
  input: {
    id: string;
    organizationId: string;
    status: Exclude<PilotReviewStatus, "pending">;
    note: string | null;
    reviewerId: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await admin
    .from("pilot_reviews")
    .select("run_id,ticket_id")
    .eq("id", input.id)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (current.error || !current.data)
    return { ok: false, error: "Pilot review not found." };
  const updated = await admin
    .from("pilot_reviews")
    .update({
      review_status: input.status,
      review_note: input.note,
      reviewed_by: input.reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("organization_id", input.organizationId);
  if (updated.error) return { ok: false, error: updated.error.message };
  const run = {
    id: current.data.run_id,
    ticket_id: current.data.ticket_id,
  };
  if (input.status === "unsafe")
    await tripPilotPause(admin, input.organizationId, "unsafe_review", run);
  await writeRunEvent(admin, {
    organization_id: input.organizationId,
    run_id: run.id,
    ticket_id: run.ticket_id,
    kind: "pilot.reviewed",
    actor: input.reviewerId,
    detail: { reviewId: input.id, status: input.status, note: input.note },
  });
  return { ok: true };
}

export async function handleAutonomousReopen(
  admin: PilotAdmin,
  input: { organizationId: string; ticketId: string }
): Promise<void> {
  if (!isAutonomousExecutionEnabled()) return;
  try {
    const result = await admin
      .from("pilot_reviews")
      .select("id,run_id,resolved_at")
      .eq("organization_id", input.organizationId)
      .eq("ticket_id", input.ticketId)
      .in("review_status", ["pending", "confirmed"]);
    const now = Date.now();
    for (const row of (result.data ?? []) as {
      id: string;
      run_id: string;
      resolved_at: string;
    }[]) {
      const age = now - new Date(row.resolved_at).getTime();
      if (age < 0 || age > 7 * 24 * 60 * 60 * 1000) continue;
      await admin
        .from("pilot_reviews")
        .update({ review_status: "incorrect", review_source: "reopen" })
        .eq("id", row.id)
        .eq("organization_id", input.organizationId);
      if (age <= 24 * 60 * 60 * 1000) {
        await tripPilotPause(admin, input.organizationId, "reopen_within_24h", {
          id: row.run_id,
          ticket_id: input.ticketId,
        });
      }
    }
  } catch (error) {
    console.error("Unable to process autonomous reopen.", error);
  }
}

export async function tripPilotPause(
  admin: PilotAdmin,
  organizationId: string,
  trigger: "unsafe_review" | "reopen_within_24h" | "daily_limit" | "breaker",
  run?: Pick<ResolutionRun, "id" | "ticket_id">
): Promise<void> {
  await setKillSwitch(admin, {
    scope: "organization",
    scopeId: organizationId,
    organizationId,
    enabled: true,
    reason: `pilot_auto_pause:${trigger}`,
    setBy: "system",
  });
  await alertSecurityEvent(admin, {
    organizationId,
    ticketId: run?.ticket_id ?? "",
    runId: run?.id ?? "",
    kind: "security.pilot_paused",
    detail: { trigger },
  });
}

export async function resumePilot(
  admin: PilotAdmin,
  organizationId: string,
  setBy: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await admin
    .from("ai_kill_switches")
    .select("reason")
    .eq("scope", "organization")
    .eq("scope_id", organizationId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (current.error) return { ok: false, error: current.error.message };
  if (
    !current.data ||
    typeof current.data.reason !== "string" ||
    !current.data.reason.startsWith("pilot_auto_pause:")
  ) {
    return {
      ok: false,
      error: "Pilot is not paused by an automatic pilot pause.",
    };
  }
  const result = await setKillSwitch(admin, {
    scope: "organization",
    scopeId: organizationId,
    organizationId,
    enabled: false,
    reason: "pilot_resumed",
    setBy,
  });
  if (!result.ok) return result;
  await alertSecurityEvent(admin, {
    organizationId,
    ticketId: "",
    runId: "",
    kind: "pilot.resumed",
  });
  return { ok: true };
}
