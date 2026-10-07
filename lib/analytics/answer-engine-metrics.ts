import { sanitizeForUser } from "@/lib/agent/untrusted";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type AnswerEngineTierMetrics = {
  tier: string;
  feedback: number;
  helpful: number;
  rate: number;
};

export type AnswerEngineUnanswered = { label: string; count: number };

export type AnswerEngineMetrics = {
  windowDays: number;
  runs: number;
  answered: number;
  answerRate: number;
  cacheHits: number;
  cacheHitRate: number;
  p90LatencyMs: number;
  helpfulByTier: AnswerEngineTierMetrics[];
  topUnanswered: AnswerEngineUnanswered[];
};

type RunRow = {
  id: string;
  status: string;
  cache_hit: boolean;
  latency_ms: number;
  top_tier: string | null;
  problem_label: string | null;
  created_at: string;
};

type FeedbackRow = { run_id: string; outcome: string };

export async function loadAnswerEngineMetrics(
  admin: Admin,
  organizationId: string | null,
  options: { windowDays?: number } = {}
): Promise<AnswerEngineMetrics | null> {
  if (!organizationId) return null;
  const windowDays = Math.min(
    365,
    Math.max(1, Math.trunc(options.windowDays ?? 30))
  );
  const from = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  try {
    const { data: runData, error: runError } = await admin
      .from("answer_engine_runs")
      .select(
        "id,status,cache_hit,latency_ms,top_tier,problem_label,created_at"
      )
      .eq("organization_id", organizationId)
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (runError || !runData) return null;
    const runs = runData as RunRow[];
    const runIds = runs.map((run) => run.id);
    let feedback: FeedbackRow[] = [];
    if (runIds.length > 0) {
      const { data, error } = await admin
        .from("answer_engine_feedback")
        .select("run_id,outcome")
        .eq("organization_id", organizationId)
        .in("run_id", runIds);
      if (error || !data) return null;
      feedback = data as FeedbackRow[];
    }

    const runById = new Map(runs.map((run) => [run.id, run]));
    const grouped = new Map<string, { feedback: number; helpful: number }>();
    for (const item of feedback) {
      const tier = runById.get(item.run_id)?.top_tier ?? "unknown";
      const count = grouped.get(tier) ?? {
        feedback: 0,
        helpful: 0,
      };
      count.feedback += 1;
      if (item.outcome === "helpful" || item.outcome === "fixed")
        count.helpful += 1;
      grouped.set(tier, count);
    }
    const helpfulByTier = [...grouped.entries()]
      .map(([tier, count]) => ({
        tier,
        ...count,
        rate: count.feedback > 0 ? count.helpful / count.feedback : 0,
      }))
      .sort((left, right) => left.tier.localeCompare(right.tier));
    const latencies = runs
      .map((run) => Math.max(0, run.latency_ms))
      .sort((left, right) => left - right);
    const p90Index = Math.max(0, Math.ceil(latencies.length * 0.9) - 1);
    const answered = runs.filter((run) => run.status === "answered").length;
    const cacheHits = runs.filter((run) => run.cache_hit).length;
    const unansweredCounts = new Map<string, number>();
    for (const run of runs) {
      if (run.status === "answered") continue;
      const label = sanitizeForUser(run.problem_label ?? "").slice(0, 120);
      if (!label) continue;
      unansweredCounts.set(label, (unansweredCounts.get(label) ?? 0) + 1);
    }
    return {
      windowDays,
      runs: runs.length,
      answered,
      answerRate: runs.length ? answered / runs.length : 0,
      cacheHits,
      cacheHitRate: runs.length ? cacheHits / runs.length : 0,
      p90LatencyMs: latencies.length ? latencies[p90Index] : 0,
      helpfulByTier,
      topUnanswered: [...unansweredCounts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.label.localeCompare(right.label)
        )
        .slice(0, 5),
    };
  } catch {
    return null;
  }
}
