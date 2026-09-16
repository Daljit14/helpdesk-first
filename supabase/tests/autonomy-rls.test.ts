import { createClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";

const url = process.env.SUPABASE_TEST_URL;
const anonKey =
  process.env.SUPABASE_TEST_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const serviceKey =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const orgA = process.env.SUPABASE_TEST_ORG_A;
const orgB = process.env.SUPABASE_TEST_ORG_B;
const orgAJwt = process.env.SUPABASE_TEST_ORG_A_JWT;
const configured = Boolean(
  url && anonKey && serviceKey && orgA && orgB && orgAJwt
);

const autonomyTables = [
  "resolution_runs",
  "resolution_steps",
  "resolution_events",
  "policy_decisions",
  "capability_executions",
  "verification_results",
  "approval_requests",
  "rollback_runs",
  "ai_kill_switches",
  "capability_breakers",
  "pilot_reviews",
  "shadow_decisions",
  "organization_autonomy_policies",
  "audit_events",
] as const;

describe.skipIf(!configured)("autonomy RLS integration", () => {
  test("anon org-A cannot access org-B autonomy rows while service role can", async () => {
    const anon = createClient(url!, anonKey!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${orgAJwt}` } },
    });
    const service = createClient(url!, serviceKey!, {
      auth: { persistSession: false },
    });
    for (const table of autonomyTables) {
      const anonymous = await anon
        .from(table)
        .select("organization_id")
        .eq("organization_id", orgB!);
      expect(anonymous.error || anonymous.data?.length === 0).toBe(true);

      const privileged = await service
        .from(table)
        .select("organization_id")
        .eq("organization_id", orgB!);
      expect(privileged.error).toBeNull();
    }

    const deniedInsert = await anon.from("resolution_events").insert({
      organization_id: orgB,
      run_id: "00000000-0000-0000-0000-000000000000",
      ticket_id: "00000000-0000-0000-0000-000000000000",
      kind: "rls.coverage_probe",
      actor: "test",
      detail: {},
    });
    expect(deniedInsert.error).not.toBeNull();
  });
});
