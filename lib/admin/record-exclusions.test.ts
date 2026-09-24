import { describe, expect, test, vi } from "vitest";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  excludeRecord,
  getExcludedRecordIds,
  isRecordExcluded,
  withoutExcluded,
} from "./record-exclusions";

describe("record exclusions", () => {
  test("filters only explicitly excluded records", () => {
    expect(withoutExcluded([{ id: "a" }, { id: "b" }], new Set(["b"]))).toEqual(
      [{ id: "a" }]
    );
  });

  test("treats a unique conflict as idempotent success", async () => {
    const admin = {
      from: vi.fn(() => ({
        insert: vi.fn(async () => ({
          error: { code: "23505", message: "duplicate" },
        })),
      })),
    };
    await expect(
      excludeRecord(admin as unknown as ReturnType<typeof createAdminClient>, {
        organizationId: "org",
        table: "tickets",
        recordId: "ticket",
        reason: "fixture",
        excludedBy: "user",
      })
    ).resolves.toEqual({ ok: true });
  });

  test("degrades when the migration is not applied", async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: null,
        error: { code: "42P01", message: "record_exclusions does not exist" },
      })),
      then: (
        resolve: (value: {
          data: null;
          error: { code: string; message: string };
        }) => unknown
      ) =>
        Promise.resolve(
          resolve({
            data: null,
            error: {
              code: "42P01",
              message: "record_exclusions does not exist",
            },
          })
        ),
    };
    const admin = {
      from: vi.fn(() => query),
    };
    await expect(
      getExcludedRecordIds(
        admin as unknown as ReturnType<
          typeof import("@/lib/supabase/admin").createAdminClient
        >,
        "org",
        "tickets"
      )
    ).resolves.toEqual(new Set());
    await expect(
      isRecordExcluded(
        admin as unknown as ReturnType<
          typeof import("@/lib/supabase/admin").createAdminClient
        >,
        "org",
        "tickets",
        "ticket"
      )
    ).resolves.toBe(false);
  });
});
