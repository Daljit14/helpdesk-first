import type { User } from "@supabase/supabase-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  filterUsers,
  formatRelativeTime,
  loadUsersOverview,
  loginStatus,
  normalizeMethods,
  parseUsersFilter,
  toUserRow,
  type AdminUserRow,
} from "./users-overview";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const mockedCreateAdminClient = vi.mocked(createAdminClient);

function authUser(id: string, overrides: Partial<User> = {}): User {
  return {
    id,
    aud: "authenticated",
    app_metadata: { providers: ["email"], provider: "email" },
    user_metadata: {},
    created_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function userRow(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: "user-1",
    email: "alex@example.com",
    name: "Alex Smith",
    methods: ["email"],
    createdAt: "2025-01-01T00:00:00.000Z",
    lastSignInAt: null,
    emailConfirmed: true,
    status: "never",
    ...overrides,
  };
}

function mockAdmin(
  pages: User[][],
  members: { user_id: string }[] = [],
  membershipError: Error | null = null
) {
  const listUsers = vi.fn(async ({ page }: { page: number }) => ({
    data: { users: pages[page - 1] ?? [] },
    error: null,
  }));
  const memberQuery = Promise.resolve({
    data: members,
    error: membershipError,
  });
  const memberEq = vi.fn(() => memberQuery);
  Object.assign(memberQuery, {
    select: vi.fn(() => memberQuery),
    eq: memberEq,
  });
  mockedCreateAdminClient.mockReturnValue({
    auth: { admin: { listUsers } },
    from: vi.fn(() => memberQuery),
  } as never);
  return { listUsers, memberQuery, memberEq };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("normalizeMethods", () => {
  test("keeps multiple providers and returns them in display order", () => {
    expect(normalizeMethods({ providers: ["email", "google"] })).toEqual([
      "google",
      "email",
    ]);
  });

  test("maps Azure to Microsoft when providers are absent", () => {
    expect(normalizeMethods({ provider: "azure" })).toEqual(["microsoft"]);
  });

  test("defaults missing provider metadata to email", () => {
    expect(normalizeMethods({})).toEqual(["email"]);
  });

  test("maps unknown providers to other", () => {
    expect(normalizeMethods({ providers: ["github"] })).toEqual(["other"]);
  });
});

describe("loginStatus", () => {
  const now = new Date("2025-02-10T12:00:00.000Z");

  test("uses exclusive 24-hour and 7-day boundaries", () => {
    expect(loginStatus("2025-02-10T11:59:00.000Z", now)).toBe("today");
    expect(loginStatus("2025-02-09T12:00:00.000Z", now)).toBe("week");
    expect(loginStatus("2025-02-03T12:00:00.000Z", now)).toBe("inactive");
    expect(loginStatus(null, now)).toBe("never");
  });
});

describe("user rows and filtering", () => {
  test("maps name, confirmation, methods, and last sign-in status", () => {
    const row = toUserRow(
      authUser("user-1", {
        email: "alex@example.com",
        email_confirmed_at: "2025-01-02T00:00:00.000Z",
        last_sign_in_at: "2025-02-10T11:00:00.000Z",
        app_metadata: { providers: ["email", "google"] },
        user_metadata: { full_name: "Alex Smith", name: "Alex" },
      }),
      new Date("2025-02-10T12:00:00.000Z")
    );

    expect(row).toMatchObject({
      email: "alex@example.com",
      name: "Alex Smith",
      methods: ["google", "email"],
      emailConfirmed: true,
      status: "today",
    });
  });

  test("filters by case-insensitive query, method, and exact status", () => {
    const rows = [
      userRow({ id: "1", email: "alex@example.com", status: "today" }),
      userRow({
        id: "2",
        email: "sam@example.com",
        name: "Alex Jones",
        methods: ["google", "email"],
        status: "week",
      }),
      userRow({
        id: "3",
        email: "jane@example.com",
        name: "Jane Doe",
        methods: ["microsoft"],
        status: "today",
      }),
    ];

    expect(filterUsers(rows, { q: "ALEX" }).map(({ id }) => id)).toEqual([
      "1",
      "2",
    ]);
    expect(filterUsers(rows, { method: "google" }).map(({ id }) => id)).toEqual(
      ["2"]
    );
    expect(filterUsers(rows, { status: "today" }).map(({ id }) => id)).toEqual([
      "1",
      "3",
    ]);
  });

  test("formats last sign-in relative to the supplied clock", () => {
    const now = new Date("2025-02-10T12:00:00.000Z");
    expect(formatRelativeTime("2025-02-10T11:55:00.000Z", now)).toBe(
      "5 min ago"
    );
    expect(formatRelativeTime("2025-02-07T12:00:00.000Z", now)).toBe(
      "3 days ago"
    );
    expect(formatRelativeTime(null, now)).toBe("Never");
  });
});

describe("parseUsersFilter", () => {
  test("drops junk values, trims query, and defaults invalid page", () => {
    expect(
      parseUsersFilter({
        q: ["   "],
        method: "administrator",
        status: "yesterday",
        page: "1.5",
      })
    ).toEqual({ page: 1 });
  });

  test("limits query length and accepts valid filters", () => {
    const filter = parseUsersFilter({
      q: ` ${"a".repeat(101)} `,
      method: "microsoft",
      status: "week",
      page: "3",
    });
    expect(filter).toEqual({
      q: "a".repeat(100),
      method: "microsoft",
      status: "week",
      page: 3,
    });
  });
});

describe("loadUsersOverview", () => {
  const now = new Date("2025-02-10T12:00:00.000Z");

  test("loads 1000-user pages until a short page and calculates scoped counts", async () => {
    const pageOne = Array.from({ length: 1000 }, (_, index) =>
      authUser(`bulk-${index}`, {
        created_at: "2025-01-01T00:00:00.000Z",
      })
    );
    const pageTwo = [
      authUser("recent", {
        created_at: "2025-01-01T00:00:00.000Z",
        last_sign_in_at: "2025-02-10T11:00:00.000Z",
        app_metadata: { providers: ["email", "google"] },
      }),
      authUser("this-week", {
        created_at: "2025-01-02T00:00:00.000Z",
        last_sign_in_at: "2025-02-08T12:00:00.000Z",
        app_metadata: { provider: "azure" },
      }),
      authUser("older", {
        created_at: "2025-01-03T00:00:00.000Z",
        last_sign_in_at: "2025-02-01T12:00:00.000Z",
      }),
    ];
    const { listUsers } = mockAdmin([pageOne, pageTwo]);

    const overview = await loadUsersOverview(
      { organizationId: null },
      { page: 1 },
      now
    );

    expect(listUsers).toHaveBeenCalledTimes(2);
    expect(listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 1000 });
    expect(listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 });
    expect(overview.total).toBe(1003);
    expect(overview.filteredTotal).toBe(1003);
    expect(overview.counts).toEqual({
      today: 1,
      week: 2,
      never: 1000,
      google: 1,
      microsoft: 1,
      email: 1002,
    });
    expect(overview.rows.slice(0, 3).map(({ id }) => id)).toEqual([
      "recent",
      "this-week",
      "older",
    ]);
    expect(overview.rows).toHaveLength(50);
  });

  test("scopes users and counts to organization membership", async () => {
    const { listUsers, memberEq } = mockAdmin(
      [
        [
          authUser("member-1", {
            last_sign_in_at: "2025-02-10T11:00:00.000Z",
            app_metadata: { provider: "google" },
          }),
          authUser("not-a-member", {
            app_metadata: { provider: "microsoft" },
          }),
          authUser("member-2", {
            app_metadata: { provider: "azure" },
          }),
        ],
      ],
      [{ user_id: "member-1" }, { user_id: "member-2" }]
    );

    const overview = await loadUsersOverview(
      { organizationId: "org-1" },
      {},
      now
    );

    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(overview.total).toBe(2);
    expect(overview.counts).toMatchObject({
      today: 1,
      never: 1,
      google: 1,
      microsoft: 1,
    });
    expect(overview.rows.map(({ id }) => id)).toEqual(["member-1", "member-2"]);
    expect(memberEq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  test("sorts creation dates, slices pages, and clamps an oversized page", async () => {
    const users = Array.from({ length: 55 }, (_, index) =>
      authUser(`user-${index}`, {
        created_at: new Date(Date.UTC(2025, 0, 1 + index)).toISOString(),
      })
    );
    mockAdmin([users]);

    const overview = await loadUsersOverview(
      { organizationId: null },
      { page: 99 },
      now
    );

    expect(overview.pageCount).toBe(2);
    expect(overview.page).toBe(2);
    expect(overview.rows).toHaveLength(5);
    expect(overview.rows.map(({ id }) => id)).toEqual([
      "user-4",
      "user-3",
      "user-2",
      "user-1",
      "user-0",
    ]);
  });

  test("throws when Auth pagination fails", async () => {
    const listUsers = vi.fn(async () => ({
      data: { users: [] },
      error: { message: "Auth unavailable" },
    }));
    mockedCreateAdminClient.mockReturnValue({
      auth: { admin: { listUsers } },
    } as never);

    await expect(
      loadUsersOverview({ organizationId: null }, {}, now)
    ).rejects.toThrow("Auth unavailable");
  });

  test("stops Auth pagination at the 20-page cap", async () => {
    const repeatedPage = [authUser("same-user")];
    const page = Array.from({ length: 1000 }, () => repeatedPage[0]!);
    const { listUsers } = mockAdmin(Array.from({ length: 20 }, () => page));

    const overview = await loadUsersOverview(
      { organizationId: null },
      { page: 1 },
      now
    );

    expect(listUsers).toHaveBeenCalledTimes(20);
    expect(overview.total).toBe(20_000);
  });
});
