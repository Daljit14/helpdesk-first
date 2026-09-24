import { describe, expect, test } from "vitest";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getDeviceShadowActivity } from "./device-shadow";

function query(data: unknown[]) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    in: () => chain,
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data, error: null })),
  };
  return chain;
}

function adminFor(opts: { runId?: string } = {}) {
  const admin = {
    from(table: string) {
      if (table === "device_jobs")
        return query([
          {
            id: "job-1",
            run_id: "run-1",
            device_id: "device-1",
            action_id: "device_network_status",
            action_version: 1,
            mode: "shadow",
            status: "succeeded",
            parameters: { host: "example.test" },
            created_at: "2026-09-24T12:00:00.000Z",
          },
        ]);
      if (table === "device_shadow_actions" && !opts.runId)
        return query([
          {
            id: "plan-1",
            device_id: "device-1",
            action_id: "device_network_status",
            action_version: 1,
            review_status: "pending",
            reason: "review",
            created_at: "2026-09-24T12:01:00.000Z",
          },
        ]);
      if (table === "devices_public")
        return query([{ id: "device-1", hostname: "laptop-1", user_id: null }]);
      throw new Error(`Unexpected table: ${table}`);
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: null },
          error: null,
        }),
      },
    },
  };
  return admin as unknown as ReturnType<typeof createAdminClient>;
}

describe("getDeviceShadowActivity", () => {
  test("returns device jobs and shadow plans together", async () => {
    const rows = await getDeviceShadowActivity(adminFor(), "org-1");
    expect(rows.map((row) => row.source)).toEqual([
      "device_job",
      "shadow_plan",
    ]);
  });

  test("run filtering returns only device-job shadow activity", async () => {
    const rows = await getDeviceShadowActivity(
      adminFor({ runId: "run-1" }),
      "org-1",
      {
        runId: "run-1",
      }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("device_job");
  });
});
