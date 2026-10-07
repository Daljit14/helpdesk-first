import { describe, expect, test, vi } from "vitest";
import {
  loadStaffVerification,
  STAFF_VERIFICATION_TTL_MS,
  staffVerificationAssurance,
  type StaffCallerVerificationRow,
} from "./staff-verification";

const now = new Date("2026-10-10T12:00:00.000Z");

function row(
  method: string,
  overrides: Partial<StaffCallerVerificationRow> = {}
): StaffCallerVerificationRow {
  return {
    ticket_id: "ticket-1",
    subject_user_id: "user-1",
    method,
    created_at: "2026-10-10T11:55:00.000Z",
    ...overrides,
  };
}

describe("staffVerificationAssurance", () => {
  test("requires a recent directory callback", () => {
    expect(
      staffVerificationAssurance([], {
        ticketId: "ticket-1",
        subjectUserId: "user-1",
        privileged: false,
        now,
      })
    ).toBeNull();
    expect(
      staffVerificationAssurance([row("directory_callback")], {
        ticketId: "ticket-1",
        subjectUserId: "user-1",
        privileged: false,
        now,
      })
    ).toEqual({
      level: "A3",
      method: "staff_callback",
      authAt: "2026-10-10T11:55:00.000Z",
      expiresAt: "2026-10-10T12:10:00.000Z",
    });
  });

  test("privileged subjects also require manager confirmation", () => {
    const callback = row("directory_callback");
    const manager = row("manager_confirmed", {
      created_at: "2026-10-10T11:58:00.000Z",
    });
    const input = {
      ticketId: "ticket-1",
      subjectUserId: "user-1",
      privileged: true,
      now,
    };
    expect(staffVerificationAssurance([callback], input)).toBeNull();
    expect(staffVerificationAssurance([callback, manager], input)).toEqual({
      level: "A3",
      method: "staff_callback",
      authAt: "2026-10-10T11:58:00.000Z",
      expiresAt: "2026-10-10T12:10:00.000Z",
    });
  });

  test.each([
    ["expired", "2026-10-10T11:44:59.999Z"],
    ["future-dated", "2026-10-10T12:00:00.001Z"],
  ])("rejects a %s callback", (_label, createdAt) => {
    expect(
      staffVerificationAssurance(
        [row("directory_callback", { created_at: createdAt })],
        {
          ticketId: "ticket-1",
          subjectUserId: "user-1",
          privileged: false,
          now,
        }
      )
    ).toBeNull();
  });

  test.each([
    ["other ticket", { ticket_id: "ticket-2" }],
    ["other subject", { subject_user_id: "user-2" }],
  ])("ignores a callback for an %s", (_label, override) => {
    expect(
      staffVerificationAssurance([row("directory_callback", override)], {
        ticketId: "ticket-1",
        subjectUserId: "user-1",
        privileged: false,
        now,
      })
    ).toBeNull();
  });

  test("expires at the earliest required tick plus the TTL", () => {
    const assurance = staffVerificationAssurance(
      [
        row("directory_callback", {
          created_at: new Date(now.getTime() - 4 * 60_000).toISOString(),
        }),
        row("manager_confirmed", {
          created_at: new Date(now.getTime() - 2 * 60_000).toISOString(),
        }),
      ],
      {
        ticketId: "ticket-1",
        subjectUserId: "user-1",
        privileged: true,
        now,
      }
    );
    expect(assurance?.expiresAt).toBe(
      new Date(
        now.getTime() - 4 * 60_000 + STAFF_VERIFICATION_TTL_MS
      ).toISOString()
    );
  });
});

describe("loadStaffVerification", () => {
  test("scopes the query and returns null when the lookup fails", async () => {
    const filters: unknown[][] = [];
    const query: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ["select", "eq", "gte"]) {
      query[method] = (...args) => {
        if (method !== "select") filters.push([method, ...args]);
        return query;
      };
    }
    query.then = (...args: unknown[]) =>
      Promise.resolve({
        data: null,
        error: { message: "query failed" },
      }).then(args[0] as (value: unknown) => unknown);
    const admin = {
      from: vi.fn(() => query),
    };
    await expect(
      loadStaffVerification(admin as never, {
        organizationId: "org-1",
        ticketId: "ticket-1",
        subjectUserId: "user-1",
        privileged: false,
        now,
      })
    ).resolves.toBeNull();
    expect(admin.from).toHaveBeenCalledWith("staff_caller_verifications");
    expect(filters).toContainEqual(["eq", "organization_id", "org-1"]);
    expect(filters).toContainEqual(["eq", "ticket_id", "ticket-1"]);
    expect(filters).toContainEqual(["eq", "subject_user_id", "user-1"]);
  });
});
