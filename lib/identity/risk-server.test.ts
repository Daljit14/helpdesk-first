import { beforeEach, describe, expect, test, vi } from "vitest";

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

import { FakeDirectory } from "@/lib/autonomy/connectors/fake";
import type {
  AccountStatus,
  DirectoryRiskFacts,
} from "@/lib/autonomy/connectors/types";
import { loadAccountRiskFacts, loadCallerDirectoryFacts } from "./risk-server";

const now = new Date("2026-10-10T12:00:00.000Z");
const account: AccountStatus = {
  directoryUserId: "directory-1",
  primaryEmail: "requester@example.com",
  enabled: true,
  suspended: false,
  passwordExpired: null,
  lastSignInAt: null,
  recentSignInErrors: [],
  mfaRegistered: null,
  groups: [],
};
const directoryFacts: DirectoryRiskFacts = {
  privileged: false,
  mfaChangedAt: "2026-10-08T12:00:00.000Z",
  signIns: [{ at: "2026-10-10T11:00:00.000Z", country: "US" }],
  directoryPhone: "+1 555 0100",
  managerName: "Manager",
};

function makeAdmin(options: { errorTable?: string } = {}) {
  const queries: Array<{
    table: string;
    filters: Array<[string, string, unknown]>;
  }> = [];
  const from = vi.fn((table: string) => {
    const query = {
      table,
      filters: [] as Array<[string, string, unknown]>,
      select: () => query,
      eq: (column: string, value: unknown) => {
        query.filters.push(["eq", column, value]);
        return query;
      },
      in: (column: string, value: unknown) => {
        query.filters.push(["in", column, value]);
        return query;
      },
      gte: (column: string, value: unknown) => {
        query.filters.push(["gte", column, value]);
        return query;
      },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => {
        const rows = await execute();
        return { data: rows.data?.[0] ?? null, error: rows.error };
      },
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve()
          .then(() => execute())
          .then(resolve),
    };
    queries.push(query);
    function execute() {
      if (table === options.errorTable)
        return { data: null, error: { message: "query failed" } };
      const rows: Record<string, unknown[]> = {
        tickets: [
          { id: "ticket-1", user_id: "user-1", organization_id: "org-1" },
          {
            id: "ticket-other",
            user_id: "user-2",
            organization_id: "org-1",
          },
        ],
        resolution_runs: [
          {
            id: "run-prior",
            ticket_id: "ticket-1",
            organization_id: "org-1",
          },
          {
            id: "run-other",
            ticket_id: "ticket-other",
            organization_id: "org-1",
          },
        ],
        approval_requests: [
          {
            run_id: "run-prior",
            ticket_id: "ticket-1",
            capability_id: "send_password_reset_link",
            organization_id: "org-1",
            created_at: "2026-10-10T11:00:00.000Z",
          },
          {
            run_id: "run-current",
            ticket_id: "ticket-1",
            capability_id: "send_password_reset_link",
            organization_id: "org-1",
            created_at: "2026-10-10T11:00:00.000Z",
          },
          {
            run_id: "run-other",
            ticket_id: "ticket-other",
            capability_id: "send_password_reset_link",
            organization_id: "org-1",
            created_at: "2026-10-10T11:00:00.000Z",
          },
        ],
        capability_executions: [
          {
            run_id: "run-prior",
            capability_id: "send_password_reset_link",
            organization_id: "org-1",
            created_at: "2026-10-10T11:00:00.000Z",
          },
        ],
        organization_members: [],
        devices: [
          {
            enrolled_at: "2026-10-10T10:00:00.000Z",
            organization_id: "org-1",
            user_id: "user-1",
            status: "active",
          },
        ],
      };
      const data = ((rows[table] ?? []) as Record<string, unknown>[]).filter(
        (row) =>
          query.filters.every(([operator, column, value]) => {
            if (operator === "eq") return row[column] === value;
            if (operator === "in")
              return Array.isArray(value) && value.includes(row[column]);
            if (operator === "gte")
              return String(row[column] ?? "") >= String(value);
            return true;
          })
      );
      return { data, error: null };
    }
    return query;
  });
  return { admin: { from } as never, from, queries };
}

beforeEach(() => {
  mocks.loadDirectory.mockResolvedValue({
    directory: new FakeDirectory(account, "google", directoryFacts),
  });
  mocks.checkRequester.mockResolvedValue({
    ok: true,
    email: "requester@example.com",
  });
});

describe("loadAccountRiskFacts", () => {
  test("counts distinct account-capability runs for only the subject's tickets", async () => {
    const { admin, queries } = makeAdmin();
    const facts = await loadAccountRiskFacts(admin, {
      organizationId: "org-1",
      subjectUserId: "user-1",
      currentRunId: "run-current",
      texts: ["Please reset my password."],
      now,
    });
    expect(facts).toMatchObject({
      priorAccountRequests24h: 1,
      mfaChangedAt: directoryFacts.mfaChangedAt,
      newestDeviceEnrolledAt: "2026-10-10T10:00:00.000Z",
      namesOtherPerson: false,
      privileged: false,
    });
    expect(
      queries.find((query) => query.table === "resolution_runs")?.filters
    ).toContainEqual(["in", "ticket_id", ["ticket-1"]]);
  });

  test("fails closed to unknown when account-history queries fail", async () => {
    const { admin } = makeAdmin({ errorTable: "capability_executions" });
    const facts = await loadAccountRiskFacts(admin, {
      organizationId: "org-1",
      subjectUserId: "user-1",
      currentRunId: null,
      texts: [],
      now,
    });
    expect(facts.priorAccountRequests24h).toBeNull();
  });
});

test("loads the read-only caller facts without exposing extra directory fields", async () => {
  const { admin } = makeAdmin();
  await expect(
    loadCallerDirectoryFacts(admin, "org-1", "user-1")
  ).resolves.toEqual({
    directoryPhone: directoryFacts.directoryPhone,
    managerName: directoryFacts.managerName,
    privileged: false,
  });
});
