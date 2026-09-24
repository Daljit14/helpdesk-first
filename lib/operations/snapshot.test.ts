import { describe, expect, test } from "vitest";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getAllExcludedRecordIds } from "./snapshot";

describe("getAllExcludedRecordIds", () => {
  test("returns no exclusions when the migration is not applied", async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
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
              message: 'relation "record_exclusions" does not exist',
            },
          })
        ),
    };
    const admin = {
      from: () => chain,
    } as unknown as ReturnType<typeof createAdminClient>;
    await expect(getAllExcludedRecordIds(admin, "tickets")).resolves.toEqual(
      new Set()
    );
  });
});
