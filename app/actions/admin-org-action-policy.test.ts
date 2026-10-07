import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isEnabled: vi.fn(),
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
  limiterCheck: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  calls: [] as Array<{ table: string; operation: string; values?: unknown }>,
  filters: [] as Array<{ table: string; column: string; value: unknown }>,
  policyCount: 0,
  existingRow: null as Record<string, unknown> | null,
  savedRow: null as Record<string, unknown> | null,
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isOrgActionPolicyEnabled: mocks.isEnabled,
}));
vi.mock("@/lib/admin/auth", () => ({
  getAdminSession: mocks.getAdminSession,
  recordAudit: mocks.recordAudit,
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  createRateLimiter: vi.fn(() => ({ check: mocks.limiterCheck })),
  getRateLimitConfig: () => ({ windowMs: 60_000, maxRequests: 30 }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  deleteOrgActionPolicyAction,
  saveOrgActionPolicyAction,
} from "./admin-org-action-policy";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
  role: "org_admin",
  organizationId: "00000000-0000-4000-8000-000000000002",
  displayName: "Admin",
  isPlatformAdmin: false,
};
const policyId = "00000000-0000-4000-8000-000000000003";

function query(table: string) {
  let operation = "select";
  let head = false;
  const current = {
    select: vi.fn((_columns?: string, options?: { head?: boolean }) => {
      head = Boolean(options?.head);
      return current;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      mocks.filters.push({ table, column, value });
      return current;
    }),
    insert: vi.fn((values: unknown) => {
      operation = "insert";
      mocks.calls.push({ table, operation, values });
      return current;
    }),
    update: vi.fn((values: unknown) => {
      operation = "update";
      mocks.calls.push({ table, operation, values });
      return current;
    }),
    delete: vi.fn(() => {
      operation = "delete";
      mocks.calls.push({ table, operation });
      return current;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "org_action_policies" && operation === "select")
        return { data: mocks.existingRow, error: null };
      if (table === "org_action_policies" && operation === "insert")
        return { data: mocks.savedRow, error: null };
      if (table === "org_action_policies" && operation === "update")
        return { data: mocks.savedRow, error: null };
      if (table === "org_action_policies" && operation === "delete")
        return { data: { id: policyId }, error: null };
      return { data: null, error: null };
    }),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => {
      if (table === "org_action_policies" && operation === "select" && head)
        return Promise.resolve({
          count: mocks.policyCount,
          error: null,
        }).then(resolve, reject);
      if (table === "org_action_policy_events" && operation === "insert")
        return Promise.resolve({ error: null }).then(resolve, reject);
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    },
  };
  return current;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    capabilityId: "search_approved_knowledge",
    effect: "allow",
    scopeGroups: ["group-a"],
    maxTier: "consent",
    autorunWindows: [],
    requireStaffApproval: false,
    note: "Approved recovery workflow",
    ...overrides,
  };
}

describe("organization AI action policy actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls = [];
    mocks.filters = [];
    mocks.policyCount = 0;
    mocks.existingRow = null;
    mocks.savedRow = {
      id: policyId,
      organization_id: session.organizationId,
      capability_id: "search_approved_knowledge",
      effect: "allow",
      scope_groups: ["group-a"],
      max_tier: "consent",
      autorun_windows: [],
      require_staff_approval: false,
      note: "Approved recovery workflow",
      updated_by: session.userId,
    };
    mocks.isEnabled.mockReturnValue(true);
    mocks.getAdminSession.mockResolvedValue(session);
    mocks.recordAudit.mockResolvedValue(undefined);
    mocks.limiterCheck.mockResolvedValue({ allowed: true });
    mocks.from.mockImplementation((table: string) => query(table));
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  });

  test("requires the enabled flag, org-admin role, and rate limit", async () => {
    mocks.isEnabled.mockReturnValue(false);
    await expect(saveOrgActionPolicyAction(input())).resolves.toEqual({
      error: "AI action policy is disabled.",
    });
    expect(mocks.from).not.toHaveBeenCalled();

    mocks.isEnabled.mockReturnValue(true);
    mocks.getAdminSession.mockResolvedValue({
      ...session,
      role: "support_agent",
    });
    await expect(saveOrgActionPolicyAction(input())).resolves.toEqual({
      error: "Organization admin access required.",
    });

    mocks.getAdminSession.mockResolvedValue(session);
    mocks.limiterCheck.mockResolvedValue({ allowed: false });
    await expect(saveOrgActionPolicyAction(input())).resolves.toEqual({
      error: "Too many AI action policy requests.",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test("validates policy input and time zones before any write", async () => {
    const invalid = input({
      autorunWindows: [
        { days: [1], start: "09:00", end: "17:00", timeZone: "Invalid/Zone" },
      ],
    });
    const result = await saveOrgActionPolicyAction(invalid);
    expect(result).toMatchObject({
      error: "Review the highlighted policy fields.",
      fieldErrors: { "autorunWindows.0.timeZone": expect.any(String) },
    });
    expect(mocks.from).not.toHaveBeenCalled();

    await expect(
      saveOrgActionPolicyAction(input({ capabilityId: "account_unlock" }))
    ).resolves.toMatchObject({
      error: "Choose an available capability.",
      fieldErrors: { capabilityId: "Choose an available capability." },
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  test("limits organization rules and writes the policy and append-only event", async () => {
    mocks.policyCount = 100;
    await expect(saveOrgActionPolicyAction(input())).resolves.toEqual({
      error: "An organization can have at most 100 policy rules.",
    });
    expect(mocks.calls.some((call) => call.operation === "insert")).toBe(false);

    mocks.policyCount = 9;
    await expect(saveOrgActionPolicyAction(input())).resolves.toEqual({
      success: true,
      message: "Policy saved.",
    });
    expect(mocks.calls).toContainEqual(
      expect.objectContaining({
        table: "org_action_policies",
        operation: "insert",
        values: expect.objectContaining({
          organization_id: session.organizationId,
          capability_id: "search_approved_knowledge",
          updated_by: session.userId,
        }),
      })
    );
    expect(mocks.calls).toContainEqual(
      expect.objectContaining({
        table: "org_action_policy_events",
        operation: "insert",
        values: expect.objectContaining({
          organization_id: session.organizationId,
          policy_id: policyId,
          capability_id: "search_approved_knowledge",
          action: "created",
          actor_user_id: session.userId,
        }),
      })
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      session,
      "org_policy.saved",
      "search_approved_knowledge"
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/resolution/policy"
    );
  });

  test("updates an existing organization rule and records before and after", async () => {
    mocks.existingRow = mocks.savedRow;
    mocks.savedRow = { ...mocks.savedRow, max_tier: "autorun" };
    await expect(
      saveOrgActionPolicyAction(input({ id: policyId, maxTier: "autorun" }))
    ).resolves.toEqual({ success: true, message: "Policy saved." });
    expect(mocks.calls).toContainEqual(
      expect.objectContaining({
        table: "org_action_policies",
        operation: "update",
        values: expect.objectContaining({ max_tier: "autorun" }),
      })
    );
    expect(mocks.filters).toContainEqual({
      table: "org_action_policies",
      column: "organization_id",
      value: session.organizationId,
    });
    expect(mocks.calls).toContainEqual(
      expect.objectContaining({
        table: "org_action_policy_events",
        operation: "insert",
        values: expect.objectContaining({
          action: "updated",
          before: mocks.existingRow,
          after: mocks.savedRow,
        }),
      })
    );
  });

  test("deletes only a policy in the active organization and records its event", async () => {
    mocks.existingRow = mocks.savedRow;
    await expect(deleteOrgActionPolicyAction(policyId)).resolves.toEqual({
      success: true,
      message: "Policy removed.",
    });
    expect(mocks.calls).toContainEqual(
      expect.objectContaining({
        table: "org_action_policies",
        operation: "delete",
      })
    );
    expect(mocks.filters).toContainEqual({
      table: "org_action_policies",
      column: "organization_id",
      value: session.organizationId,
    });
    expect(mocks.calls).toContainEqual(
      expect.objectContaining({
        table: "org_action_policy_events",
        operation: "insert",
        values: expect.objectContaining({
          policy_id: policyId,
          action: "deleted",
          after: null,
        }),
      })
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      session,
      "org_policy.deleted",
      "search_approved_knowledge"
    );
  });
});
