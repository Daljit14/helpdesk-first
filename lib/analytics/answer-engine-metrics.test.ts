import type { createAdminClient } from "@/lib/supabase/admin";
import { describe, expect, test, vi } from "vitest";
import { loadAnswerEngineMetrics } from "./answer-engine-metrics";

type QueryRows = {
  runs: Record<string, unknown>[];
  feedback: Array<{ run_id: string; outcome: string }>;
  runError?: { code: string };
  feedbackError?: { code: string };
};

function adminFor(rows: QueryRows) {
  const organizationFilters: Array<[string, string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const builder = {
      select: (_columns: string) => builder,
      eq: (column: string, value: unknown) => {
        organizationFilters.push([table, column, value]);
        return builder;
      },
      gte: (_column: string, _value: string) => builder,
      order: (_column: string, _options: { ascending: boolean }) => builder,
      limit: async (_count: number) => ({
        data: rows.runs,
        error: rows.runError ?? null,
      }),
      in: async (_column: string, _values: string[]) => ({
        data: rows.feedback,
        error: rows.feedbackError ?? null,
      }),
    };
    return builder;
  });
  return {
    admin: { from } as unknown as ReturnType<typeof createAdminClient>,
    from,
    organizationFilters,
  };
}

function run(
  id: string,
  status: string,
  topTier: string | null,
  cacheHit: boolean,
  latency: number,
  label: string
) {
  return {
    id,
    status,
    top_tier: topTier,
    cache_hit: cacheHit,
    latency_ms: latency,
    problem_label: label,
    created_at: "2026-10-07T00:00:00.000Z",
  };
}

describe("answer-engine metrics", () => {
  test("returns null without an organization and never queries shared data", async () => {
    const { admin, from } = adminFor({ runs: [], feedback: [] });
    await expect(loadAnswerEngineMetrics(admin, null)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  test("returns null when answer-engine tables are missing or fail", async () => {
    const { admin } = adminFor({
      runs: [],
      feedback: [],
      runError: { code: "42P01" },
    });
    await expect(loadAnswerEngineMetrics(admin, "org-1")).resolves.toBeNull();
    const feedbackAdmin = adminFor({
      runs: [run("run-1", "answered", "vendor", false, 100, "App issue")],
      feedback: [],
      feedbackError: { code: "PGRST205" },
    });
    await expect(
      loadAnswerEngineMetrics(feedbackAdmin.admin, "org-1")
    ).resolves.toBeNull();
  });

  test("computes scoped answer, cache, latency, feedback, and unanswered metrics", async () => {
    const { admin, from, organizationFilters } = adminFor({
      runs: [
        run("run-1", "answered", "vendor", true, 100, "App issue"),
        run("run-2", "answered", "vendor", false, 200, "App issue"),
        run("run-3", "no_sources", null, false, 300, "Wi-Fi issue"),
        run("run-4", "low_confidence", "community", false, 400, "Wi-Fi issue"),
        run("run-5", "no_sources", null, false, 400, " "),
      ],
      feedback: [
        { run_id: "run-1", outcome: "helpful" },
        { run_id: "run-2", outcome: "not_helpful" },
        { run_id: "run-4", outcome: "fixed" },
      ],
    });
    const metrics = await loadAnswerEngineMetrics(admin, "org-1", {
      windowDays: 30,
    });
    expect(from).toHaveBeenCalledTimes(2);
    expect(organizationFilters).toEqual([
      ["answer_engine_runs", "organization_id", "org-1"],
      ["answer_engine_feedback", "organization_id", "org-1"],
    ]);
    expect(metrics).toMatchObject({
      windowDays: 30,
      runs: 5,
      answered: 2,
      answerRate: 0.4,
      cacheHits: 1,
      cacheHitRate: 0.2,
      p90LatencyMs: 400,
      helpfulByTier: [
        { tier: "community", feedback: 1, helpful: 1, rate: 1 },
        { tier: "vendor", feedback: 2, helpful: 1, rate: 0.5 },
      ],
      topUnanswered: [{ label: "Wi-Fi issue", count: 2 }],
    });
  });
});
