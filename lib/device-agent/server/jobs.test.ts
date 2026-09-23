import { describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordJobResult } from "./jobs";

function fakeAdmin(
  job: Record<string, unknown>,
  original: Record<string, unknown>
) {
  const updates: Array<Record<string, unknown>> = [];
  const admin = {
    updates,
    from(table: string) {
      if (table === "device_jobs")
        return {
          select(columns: string) {
            const row = columns === "*" ? job : original;
            return {
              eq() {
                return this;
              },
              maybeSingle: async () => ({ data: row, error: null }),
            };
          },
          update(value: Record<string, unknown>) {
            updates.push(value);
            return {
              eq() {
                return this;
              },
              then(
                resolve: (value: { error: null }) => unknown
              ): Promise<unknown> {
                return Promise.resolve(resolve({ error: null }));
              },
            };
          },
        };
      return {
        insert: vi.fn(async () => ({ error: null })),
      };
    },
  };
  return admin;
}

describe("recordJobResult", () => {
  it("fails rollback reports whose snapshot hash differs", async () => {
    const admin = fakeAdmin(
      {
        id: "job-rollback",
        device_id: "device-1",
        organization_id: "org-1",
        status: "leased",
        kind: "rollback",
        rollback_of: "job-original",
      },
      { snapshot_hash: "original-hash" }
    );
    const result = await recordJobResult(
      admin as unknown as ReturnType<typeof createAdminClient>,
      {
        id: "device-1",
        organization_id: "org-1",
        user_id: null,
        device_class: "managed",
        platform: "linux",
        hostname: "host",
        agent_version: "1.1.0",
        public_key: "key",
        catalog_version: "2026-09-21.3",
        status: "active",
      },
      "job-rollback",
      {
        status: "succeeded",
        output: {},
        snapshot: { hash: "wrong-hash", kinds: ["adapter_config"] },
      }
    );
    expect(result).toEqual({ ok: true });
    expect(admin.updates[0]).toMatchObject({
      status: "failed",
      error: "snapshot_hash_mismatch",
    });
  });
});
