import { afterEach, describe, expect, test, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDbOverview, loadLiveEvents } from "./database-overview";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

type Result = {
  data: Record<string, unknown>[];
  count?: number | null;
  error: Error | null;
};

function builder(result: Result) {
  const query = Promise.resolve(result);
  Object.assign(query, {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    gt: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
  });
  return query;
}

function mockClient(
  overrides: Record<string, Result> = {},
  failingTable?: string
) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn((table: string) => {
      const result =
        failingTable === table
          ? { data: [], count: null, error: new Error(`${table} failed`) }
          : (overrides[table] ?? {
              data: [
                {
                  id: `${table}-1`,
                  organization_id: "org-1",
                  created_at: "2025-01-01T00:00:00.000Z",
                  updated_at: "2025-01-01T00:00:00.000Z",
                  status: "open",
                },
              ],
              count: 1,
              error: null,
            });
      const query = builder(result);
      for (const method of ["select", "eq", "in", "gt", "order", "limit"]) {
        const original = query[method as keyof typeof query] as ReturnType<
          typeof vi.fn
        >;
        original.mockImplementation((...args: unknown[]) => {
          calls.push({ table, method, args });
          return query;
        });
      }
      return query;
    }),
  } as never);
  return calls;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadDbOverview", () => {
  test("returns all sections with exact counts", async () => {
    mockClient({
      organization_members: {
        data: [{ user_id: "user-1" }],
        count: 1,
        error: null,
      },
      admin_auth_users: {
        data: [
          {
            id: "user-1",
            email: "user@example.com",
            provider: "email",
            created_at: "2025-01-01T00:00:00.000Z",
            last_sign_in_at: null,
          },
        ],
        count: 1,
        error: null,
      },
    });

    const result = await loadDbOverview({ organizationId: "org-1" });

    expect(result.sections).toHaveLength(13);
    expect(result.sections.map((section) => section.key)).toEqual([
      "users",
      "organizations",
      "members",
      "tickets",
      "agent_sessions",
      "resolution_runs",
      "devices",
      "attachments",
      "notifications",
      "ai_calls",
      "audit",
      "ticket_events",
      "analytics",
    ]);
    expect(result.sections.every((section) => section.count === 1)).toBe(true);
  });

  test("keeps loading other sections when one table fails", async () => {
    mockClient({}, "devices");

    const result = await loadDbOverview({ organizationId: null });
    const devices = result.sections.find(
      (section) => section.key === "devices"
    );
    const tickets = result.sections.find(
      (section) => section.key === "tickets"
    );

    expect(devices).toMatchObject({
      count: null,
      rows: [],
      error: "devices failed",
    });
    expect(tickets?.count).toBe(1);
  });
});

describe("loadLiveEvents", () => {
  test("maps auth and ticket events, sorts newest first, and returns max cursor", async () => {
    mockClient({
      admin_auth_users: {
        data: [
          {
            id: "user-1",
            email: "jane@example.com",
            provider: "google",
            created_at: "2025-01-01T01:00:00.000Z",
            last_sign_in_at: "2025-01-01T03:00:00.000Z",
          },
        ],
        error: null,
      },
      tickets: {
        data: [
          {
            id: "ticket-1",
            issue_title: "Wi-Fi keeps dropping",
            status: "New",
            created_at: "2025-01-01T02:00:00.000Z",
            updated_at: "2025-01-01T02:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    const result = await loadLiveEvents(
      { organizationId: null },
      "2025-01-01T00:00:00.000Z"
    );

    expect(result.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["signup", "login", "ticket_created"])
    );
    expect(result.events[0]?.kind).toBe("login");
    expect(result.events.find((event) => event.kind === "signup")?.title).toBe(
      "New account: j***@example.com"
    );
    expect(
      result.events.find((event) => event.kind === "ticket_created")
    ).toMatchObject({
      href: "/admin/tickets/ticket-1",
    });
    expect(result.cursor).toBe("2025-01-01T03:00:00.000Z");
  });

  test("applies organization scope to member and event queries", async () => {
    const calls = mockClient({
      organization_members: {
        data: [{ user_id: "user-1" }],
        error: null,
      },
    });

    await loadLiveEvents(
      { organizationId: "org-1" },
      "2025-01-01T00:00:00.000Z"
    );

    expect(
      calls.some(
        (call) =>
          call.table === "tickets" &&
          call.method === "eq" &&
          call.args[0] === "organization_id" &&
          call.args[1] === "org-1"
      )
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.table === "admin_auth_users" &&
          call.method === "in" &&
          call.args[0] === "id" &&
          JSON.stringify(call.args[1]) === JSON.stringify(["user-1"])
      )
    ).toBe(true);
  });
});
