import { describe, expect, test, vi } from "vitest";
import type { createAdminClient } from "@/lib/supabase/admin";
import { excludeRecord, withoutExcluded } from "./record-exclusions";

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
});
