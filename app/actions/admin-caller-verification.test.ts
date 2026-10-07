import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canAccessTicket: vi.fn(),
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
  isStaffVerificationEnabled: vi.fn(),
  resumeAfterApproval: vi.fn(),
  writeRunEvent: vi.fn(),
  loadCallerDirectoryFacts: vi.fn(),
  createAdminClient: vi.fn(),
  rateCheck: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  canAccessTicket: mocks.canAccessTicket,
  getAdminSession: mocks.getAdminSession,
  recordAudit: mocks.recordAudit,
}));
vi.mock("@/lib/admin/flags", () => ({
  isStaffVerificationEnabled: mocks.isStaffVerificationEnabled,
}));
vi.mock("@/lib/autonomy/executor/resume", () => ({
  resumeAfterApproval: mocks.resumeAfterApproval,
}));
vi.mock("@/lib/autonomy/orchestrator", () => ({
  writeRunEvent: mocks.writeRunEvent,
}));
vi.mock("@/lib/identity/risk-server", () => ({
  loadCallerDirectoryFacts: mocks.loadCallerDirectoryFacts,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("./admin-pilot-limiter", () => ({
  pilotActionLimiter: { check: mocks.rateCheck },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  decideTechnicianApproval,
  recordCallerVerification,
} from "./admin-caller-verification";

const ticketId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const staffId = "00000000-0000-4000-8000-000000000003";
const run = {
  id: "run-1",
  organization_id: "org-1",
  ticket_id: ticketId,
  status: "awaiting_approval",
  previous_status: "planning",
  attempts: 0,
  max_attempts: 3,
  cost_cents: 0,
  budget_cents: 50,
  deadline_at: "2026-10-10T12:00:00.000Z",
  initiated_by: "ai",
  planner_version: null,
  model: null,
  prompt_version: null,
  policy_version: null,
  escalation_reason: null,
  created_at: "2026-10-10T11:00:00.000Z",
  updated_at: "2026-10-10T11:00:00.000Z",
  completed_at: null,
};

function makeAdmin(
  data: Record<string, unknown>,
  inserts: Array<{ table: string; value: unknown }> = []
) {
  return {
    from: (table: string) => {
      let result = { data: data[table] ?? null, error: null };
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gte", "gt", "order", "limit"]) {
        query[method] = () => query;
      }
      query.maybeSingle = async () => result;
      query.insert = (value: unknown) => {
        inserts.push({ table, value });
        return query;
      };
      query.update = () => {
        result = { data: { id: "approval-1" }, error: null };
        return query;
      };
      query.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result).then(resolve);
      return query;
    },
  };
}

const session = {
  userId: staffId,
  email: "staff@example.com",
  role: "org_admin" as const,
  organizationId: "org-1",
  displayName: "Staff",
  isPlatformAdmin: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isStaffVerificationEnabled.mockReturnValue(true);
  mocks.getAdminSession.mockResolvedValue(session);
  mocks.canAccessTicket.mockReturnValue(true);
  mocks.rateCheck.mockResolvedValue({ allowed: true });
  mocks.resumeAfterApproval.mockResolvedValue(run);
  mocks.loadCallerDirectoryFacts.mockResolvedValue({
    directoryPhone: "+1 555 0100",
    managerName: "Manager",
    privileged: false,
  });
});

describe("caller verification actions", () => {
  test("is unavailable while staff verification is disabled", async () => {
    mocks.isStaffVerificationEnabled.mockReturnValue(false);
    await expect(
      recordCallerVerification(ticketId, "directory_callback")
    ).resolves.toEqual({ error: "Not available." });
    expect(mocks.getAdminSession).not.toHaveBeenCalled();
  });

  test("rejects self-verification with the prescribed message", async () => {
    const admin = makeAdmin({
      tickets: {
        id: ticketId,
        organization_id: "org-1",
        user_id: staffId,
        assigned_agent_id: staffId,
        status: "Open",
      },
    });
    mocks.createAdminClient.mockReturnValue(admin);
    await expect(
      recordCallerVerification(ticketId, "directory_callback")
    ).resolves.toEqual({ error: "You can't verify yourself." });
    expect(mocks.loadCallerDirectoryFacts).not.toHaveBeenCalled();
  });

  test("records staff ticks and emits a run event", async () => {
    const inserts: Array<{ table: string; value: unknown }> = [];
    const admin = makeAdmin(
      {
        tickets: {
          id: ticketId,
          organization_id: "org-1",
          user_id: userId,
          assigned_agent_id: staffId,
          status: "Open",
        },
        resolution_runs: run,
      },
      inserts
    );
    mocks.createAdminClient.mockReturnValue(admin);
    await expect(
      recordCallerVerification(ticketId, "directory_callback")
    ).resolves.toEqual({ success: true });
    expect(inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "staff_caller_verifications",
          value: expect.objectContaining({
            organization_id: "org-1",
            ticket_id: ticketId,
            subject_user_id: userId,
            verified_by: staffId,
            method: "directory_callback",
          }),
        }),
        expect.objectContaining({
          table: "ticket_actions",
          value: expect.objectContaining({
            tool_name: "caller_verification",
            action_summary: "Called back on the directory number",
            result_summary: "Recorded",
            consent_required: false,
            consent_received: false,
            approval_type: "none",
          }),
        }),
      ])
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      session,
      "ticket.caller_verified",
      ticketId
    );
    expect(mocks.writeRunEvent).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        kind: "staff.caller_verified",
        actor: `staff:${staffId}`,
        detail: { method: "directory_callback" },
      })
    );
  });

  test("resumes granted technician approvals with the staff UUID consent", async () => {
    const approvalId = "00000000-0000-4000-8000-000000000004";
    const admin = makeAdmin({
      approval_requests: {
        id: approvalId,
        organization_id: "org-1",
        run_id: run.id,
        ticket_id: ticketId,
        type: "technician_approval",
        status: "requested",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      tickets: {
        id: ticketId,
        organization_id: "org-1",
        user_id: userId,
        assigned_agent_id: staffId,
        status: "Open",
      },
      resolution_runs: run,
    });
    mocks.createAdminClient.mockReturnValue(admin);
    await expect(
      decideTechnicianApproval(approvalId, "grant")
    ).resolves.toEqual({ success: true });
    expect(mocks.resumeAfterApproval).toHaveBeenCalledWith(admin, run, {
      actor: staffId,
      consent: { type: "technician_approval", userId: staffId },
    });
  });
});
