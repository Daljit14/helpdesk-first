import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadDirectory: vi.fn(),
  checkRequester: vi.fn(),
}));

vi.mock("@/lib/autonomy/connectors", () => ({
  loadDirectoryForOrganization: mocks.loadDirectory,
}));
vi.mock("@/lib/autonomy/connectors/binding", () => ({
  checkRequesterEmailForOrg: mocks.checkRequester,
}));

import {
  __resetOrgPolicyGroupCache,
  loadOrgPolicyCeiling,
  loadOrgPolicyDecision,
} from "./org-policy-server";

const orgId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const policyId = "00000000-0000-4000-8000-000000000003";

function policy(overrides: Record<string, unknown> = {}) {
  return {
    id: policyId,
    capability_id: "account_unlock",
    effect: "allow",
    scope_groups: ["group-a"],
    max_tier: "consent",
    autorun_windows: [],
    require_staff_approval: false,
    ...overrides,
  };
}

function admin(rows: Record<string, unknown>[], error: unknown = null) {
  const calls: Array<{ table: string; column: string; value: unknown }> = [];
  const queryFor = (table: string) => {
    const query: Record<string, unknown> = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        calls.push({ table, column, value });
        return query;
      },
      in: (column: string, value: unknown) => {
        calls.push({ table, column, value });
        return query;
      },
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown
      ) =>
        Promise.resolve({
          data: table === "org_action_policies" ? rows : [],
          error: table === "org_action_policies" ? error : null,
        }).then(resolve, reject),
    };
    return query;
  };
  return {
    calls,
    client: { from: (table: string) => queryFor(table) } as never,
  };
}

function directory(
  groups: string[] | null,
  options: {
    provider?: "entra" | "google";
    fail?: boolean;
    lookupGroups?: string[];
  } = {}
) {
  const getUserById = vi.fn(async () =>
    groups === null || options.fail
      ? {
          ok: false as const,
          error: { kind: "unavailable" as const, message: "unavailable" },
        }
      : {
          ok: true as const,
          value: {
            directoryUserId: "directory-user-1",
            primaryEmail: "person@example.com",
            enabled: true,
            suspended: false,
            passwordExpired: null,
            lastSignInAt: null,
            recentSignInErrors: [],
            mfaRegistered: null,
            groups,
          },
        }
  );
  mocks.loadDirectory.mockResolvedValue({
    config: { provider: options.provider ?? "entra" },
    directory: {
      lookupUserByEmail: vi.fn(async () => ({
        ok: true as const,
        value: {
          directoryUserId: "directory-user-1",
          primaryEmail: "person@example.com",
          enabled: true,
          suspended: false,
          passwordExpired: null,
          lastSignInAt: null,
          recentSignInErrors: [],
          mfaRegistered: null,
          groups: options.lookupGroups ?? [],
        },
      })),
      getUserById,
    },
  });
  mocks.checkRequester.mockResolvedValue({
    ok: true,
    email: "person@example.com",
  });
  return { getUserById };
}

beforeEach(() => {
  vi.stubEnv("HELP_DESK_ORG_ACTION_POLICY_ENABLED", "true");
  __resetOrgPolicyGroupCache();
  mocks.loadDirectory.mockReset();
  mocks.checkRequester.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetOrgPolicyGroupCache();
});

describe("loadOrgPolicyDecision", () => {
  test("returns null with no database reads when the flag is off", async () => {
    vi.stubEnv("HELP_DESK_ORG_ACTION_POLICY_ENABLED", "false");
    const db = admin([]);
    expect(
      await loadOrgPolicyDecision(db.client, {
        organizationId: orgId,
        capabilityId: "account_unlock",
        subjectUserId: userId,
        tier: "autorun",
        now: new Date("2026-10-07T12:00:00Z"),
      })
    ).toBeNull();
    expect(db.calls).toEqual([]);
  });

  test("reads only organization policy and does not load groups when unscoped", async () => {
    const db = admin([policy({ scope_groups: [], max_tier: "autorun" })]);
    const result = await loadOrgPolicyDecision(db.client, {
      organizationId: orgId,
      capabilityId: "account_unlock",
      subjectUserId: userId,
      tier: "autorun",
      now: new Date("2026-10-07T12:00:00Z"),
    });
    expect(result).toMatchObject({ allowed: true, governed: true });
    expect(db.calls).toEqual([
      { table: "org_action_policies", column: "organization_id", value: orgId },
      {
        table: "org_action_policies",
        column: "capability_id",
        value: ["account_unlock", "*"],
      },
    ]);
    expect(mocks.loadDirectory).not.toHaveBeenCalled();
  });

  test("loads verified directory groups for scoped rules and caches successful results", async () => {
    const { getUserById } = directory(["group-a"]);
    const db = admin([policy()]);
    const input = {
      organizationId: orgId,
      capabilityId: "account_unlock",
      subjectUserId: userId,
      tier: "autorun" as const,
      now: new Date("2026-10-07T12:00:00Z"),
    };
    const first = await loadOrgPolicyDecision(db.client, input);
    const second = await loadOrgPolicyDecision(db.client, input);
    expect(first).toMatchObject({ allowed: true, effectiveMaxTier: "consent" });
    expect(second).toEqual(first);
    expect(mocks.checkRequester).toHaveBeenCalledWith(db.client, orgId, userId);
    expect(getUserById).toHaveBeenCalledTimes(1);
    expect(db.calls).toContainEqual({
      table: "org_action_policies",
      column: "capability_id",
      value: ["account_unlock", "*"],
    });
  });

  test("retains lookup memberships when account status omits groups", async () => {
    const db = admin([
      policy({ scope_groups: ["group-a"], max_tier: "consent" }),
    ]);
    const { getUserById } = directory([], { lookupGroups: ["group-a"] });
    const result = await loadOrgPolicyDecision(db.client, {
      organizationId: orgId,
      capabilityId: "account_unlock",
      subjectUserId: userId,
      tier: "consent",
      now: new Date("2026-10-07T12:00:00Z"),
    });
    expect(result).toMatchObject({ allowed: true, governed: true });
    expect(getUserById).toHaveBeenCalledOnce();
  });

  test("fails scoped allow closed when groups cannot be loaded", async () => {
    directory(null);
    const db = admin([policy()]);
    const result = await loadOrgPolicyDecision(db.client, {
      organizationId: orgId,
      capabilityId: "account_unlock",
      subjectUserId: userId,
      tier: "autorun",
      now: new Date("2026-10-07T12:00:00Z"),
    });
    expect(result).toMatchObject({
      allowed: false,
      reasons: ["org_policy_not_in_scope", "org_policy_groups_unavailable"],
    });
  });

  test("does not cache failed directory group reads", async () => {
    const { getUserById } = directory(null);
    const db = admin([policy()]);
    const input = {
      organizationId: orgId,
      capabilityId: "account_unlock",
      subjectUserId: userId,
      tier: "autorun" as const,
      now: new Date("2026-10-07T12:00:00Z"),
    };
    await loadOrgPolicyDecision(db.client, input);
    await loadOrgPolicyDecision(db.client, input);
    expect(getUserById).toHaveBeenCalledTimes(2);
  });

  test("treats Google group enumeration as unavailable", async () => {
    const { getUserById } = directory([], { provider: "google" });
    const db = admin([policy()]);
    const result = await loadOrgPolicyDecision(db.client, {
      organizationId: orgId,
      capabilityId: "account_unlock",
      subjectUserId: userId,
      tier: "autorun",
      now: new Date("2026-10-07T12:00:00Z"),
    });
    expect(result?.allowed).toBe(false);
    expect(getUserById).not.toHaveBeenCalled();
  });

  test("fails closed on policy read errors", async () => {
    const db = admin([], { message: "db unavailable" });
    const result = await loadOrgPolicyDecision(db.client, {
      organizationId: orgId,
      capabilityId: "account_unlock",
      subjectUserId: userId,
      tier: "autorun",
      now: new Date("2026-10-07T12:00:00Z"),
    });
    expect(result).toMatchObject({
      allowed: false,
      effectiveMaxTier: "disabled",
      reasons: ["org_policy_denied"],
    });
  });
});

describe("loadOrgPolicyCeiling", () => {
  test("returns disabled when the policy table cannot be read", async () => {
    expect(
      await loadOrgPolicyCeiling(
        admin([], { message: "db unavailable" }).client,
        {
          organizationId: orgId,
          capabilityId: "account_unlock",
        }
      )
    ).toBe("disabled");
  });
});
