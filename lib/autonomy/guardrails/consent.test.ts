import { describe, expect, test, vi } from "vitest";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { ResolutionRun } from "../orchestrator";
import { verifyConsent } from "./consent";

const run: ResolutionRun = {
  id: "run-1",
  organization_id: "org-1",
  ticket_id: "ticket-1",
  status: "awaiting_consent",
  previous_status: "planning",
  attempts: 0,
  max_attempts: 3,
  cost_cents: 0,
  budget_cents: 50,
  deadline_at: new Date(Date.now() + 60_000).toISOString(),
  initiated_by: "ai",
  planner_version: null,
  model: null,
  prompt_version: null,
  policy_version: null,
  escalation_reason: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  completed_at: null,
};

function admin(
  options: {
    row?: Record<string, unknown> | null;
    ticketUser?: string;
    member?: boolean;
    consumed?: boolean;
    consumeRace?: boolean;
  } = {}
) {
  const row = {
    id: "approval-1",
    organization_id: "org-1",
    run_id: "run-1",
    ticket_id: "ticket-1",
    type: "user_consent",
    status: "granted",
    expires_at: null,
    capability_id: "safe_capability",
    capability_version: 1,
    parameter_hash: "hash-1",
    risk_level: "caution",
    consumed_at: options.consumed ? new Date().toISOString() : null,
    decided_by_user_id: "user-1",
    ...options.row,
  };
  const from = vi.fn((table: string) => {
    let updated = false;
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const name of ["select", "eq", "order", "limit", "in", "is"]) {
      chain[name] = () => chain;
    }
    chain.maybeSingle = async () => {
      if (updated) {
        return {
          data: options.consumeRace ? null : { id: "approval-1" },
          error: null,
        };
      }
      if (table === "approval_requests") {
        return { data: options.row === null ? null : row, error: null };
      }
      if (table === "tickets") {
        return {
          data: { user_id: options.ticketUser ?? "user-1" },
          error: null,
        };
      }
      return {
        data: options.member === false ? null : { role: "support_agent" },
        error: null,
      };
    };
    chain.update = () => {
      updated = true;
      return chain;
    };
    chain.then = (...args: unknown[]) => {
      const resolve = args[0] as (value: unknown) => unknown;
      return Promise.resolve({
        data: options.consumeRace ? null : { id: "approval-1" },
        error: null,
      }).then(resolve);
    };
    return chain;
  });
  return { from } as unknown as ReturnType<typeof createAdminClient>;
}

function expected() {
  return {
    type: "user_consent" as const,
    userId: "user-1",
    organizationId: "org-1",
    ticketId: "ticket-1",
    capabilityId: "safe_capability",
    capabilityVersion: 1,
    parameterHash: "hash-1",
    riskLevel: "caution",
  };
}

describe("bound consent", () => {
  test("rejects expired, reused, and atomic-consume race approvals", async () => {
    await expect(
      verifyConsent(
        admin({ row: { expires_at: new Date(Date.now() - 1).toISOString() } }),
        run,
        expected()
      )
    ).resolves.toMatchObject({ ok: false, code: "consent_expired" });
    await expect(
      verifyConsent(admin({ consumeRace: true }), run, expected())
    ).resolves.toMatchObject({ ok: false, code: "consent_reused" });
    await expect(
      verifyConsent(admin({ consumed: true }), run, expected())
    ).resolves.toMatchObject({ ok: false, code: "consent_reused" });
  });

  test("rejects wrong user, organization, capability, version, and parameters", async () => {
    await expect(
      verifyConsent(admin({ ticketUser: "other-user" }), run, expected())
    ).resolves.toMatchObject({ ok: false, code: "consent_wrong_user" });
    await expect(
      verifyConsent(
        admin({ row: { organization_id: "other-org" } }),
        run,
        expected()
      )
    ).resolves.toMatchObject({ ok: false, code: "consent_wrong_org" });
    await expect(
      verifyConsent(
        admin({ row: { capability_id: "other_capability" } }),
        run,
        expected()
      )
    ).resolves.toMatchObject({ ok: false, code: "consent_wrong_capability" });
    await expect(
      verifyConsent(admin({ row: { capability_version: 2 } }), run, expected())
    ).resolves.toMatchObject({ ok: false, code: "consent_wrong_capability" });
    await expect(
      verifyConsent(
        admin({ row: { parameter_hash: "changed" } }),
        run,
        expected()
      )
    ).resolves.toMatchObject({ ok: false, code: "consent_parameters_changed" });
  });

  test("requires a real technician organization member", async () => {
    await expect(
      verifyConsent(
        admin({
          row: { type: "technician_approval", decided_by_user_id: "staff-1" },
          member: false,
        }),
        run,
        { ...expected(), type: "technician_approval", userId: "staff-1" }
      )
    ).resolves.toMatchObject({ ok: false, code: "consent_wrong_user" });
  });
});
