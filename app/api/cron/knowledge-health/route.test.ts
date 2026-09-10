import { describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const { enabled } = vi.hoisted(() => ({ enabled: vi.fn() }));
vi.mock("@/lib/admin/flags", () => ({
  isKnowledgeHealthEnabled: enabled,
}));
vi.mock("@/lib/knowledge/health", () => ({
  runKnowledgeHealthScan: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

describe("knowledge-health cron", () => {
  test("rejects requests without CRON_SECRET", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const response = await GET(
      new Request("http://localhost/api/cron/knowledge-health")
    );
    expect(response.status).toBe(401);
  });

  test("returns skipped when the feature is disabled", async () => {
    process.env.CRON_SECRET = "cron-secret";
    enabled.mockReturnValue(false);
    const response = await GET(
      new Request("http://localhost/api/cron/knowledge-health", {
        headers: { Authorization: "Bearer cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ skipped: true });
  });
});
