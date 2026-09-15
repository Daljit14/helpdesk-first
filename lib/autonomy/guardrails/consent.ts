import { createAdminClient } from "@/lib/supabase/admin";
import type { ResolutionRun } from "../orchestrator";

type Admin = ReturnType<typeof createAdminClient>;

export type ConsentCheck = {
  type: "user_consent" | "technician_approval";
  userId: string;
  organizationId: string;
  ticketId: string;
  capabilityId: string;
  capabilityVersion: number;
  parameterHash: string;
  riskLevel: string;
};

export type ConsentResult =
  | { ok: true; id: string }
  | {
      ok: false;
      code:
        | "consent_missing"
        | "consent_expired"
        | "consent_reused"
        | "consent_wrong_user"
        | "consent_wrong_org"
        | "consent_wrong_capability"
        | "consent_parameters_changed";
    };

export async function verifyConsent(
  admin: Admin,
  run: ResolutionRun,
  expected: ConsentCheck
): Promise<ConsentResult> {
  const result = await admin
    .from("approval_requests")
    .select(
      "id,organization_id,run_id,ticket_id,type,status,expires_at,capability_id,capability_version,parameter_hash,risk_level,consumed_at,decided_by_user_id"
    )
    .eq("organization_id", run.organization_id)
    .eq("run_id", run.id)
    .eq("ticket_id", run.ticket_id)
    .eq("type", expected.type)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error || !result.data)
    return { ok: false, code: "consent_missing" };
  const row = result.data as {
    id: string;
    organization_id: string;
    run_id: string;
    ticket_id: string;
    status: string;
    expires_at: string | null;
    capability_id: string | null;
    capability_version: number | null;
    parameter_hash: string | null;
    risk_level: string | null;
    consumed_at: string | null;
    decided_by_user_id: string | null;
  };
  if (row.organization_id !== expected.organizationId)
    return { ok: false, code: "consent_wrong_org" };
  if (row.consumed_at) return { ok: false, code: "consent_reused" };
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())
    return { ok: false, code: "consent_expired" };
  if (row.status !== "granted") return { ok: false, code: "consent_missing" };
  if (
    row.capability_id !== expected.capabilityId ||
    row.capability_version !== expected.capabilityVersion
  )
    return { ok: false, code: "consent_wrong_capability" };
  if (row.parameter_hash !== expected.parameterHash)
    return { ok: false, code: "consent_parameters_changed" };
  if (expected.type === "user_consent") {
    if (row.decided_by_user_id !== expected.userId)
      return { ok: false, code: "consent_wrong_user" };
    const ticket = await admin
      .from("tickets")
      .select("user_id")
      .eq("organization_id", expected.organizationId)
      .eq("id", expected.ticketId)
      .maybeSingle();
    if (ticket.error || ticket.data?.user_id !== expected.userId)
      return { ok: false, code: "consent_wrong_user" };
  } else {
    const member = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", expected.organizationId)
      .eq("user_id", expected.userId)
      .in("role", ["support_agent", "org_admin", "admin", "platform_admin"])
      .maybeSingle();
    if (member.error || !member.data)
      return { ok: false, code: "consent_wrong_user" };
  }
  const consumed = await admin
    .from("approval_requests")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("organization_id", run.organization_id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consumed.error || !consumed.data)
    return { ok: false, code: "consent_reused" };
  return { ok: true, id: consumed.data.id as string };
}
