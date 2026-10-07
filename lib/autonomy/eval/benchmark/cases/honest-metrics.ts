import { BENCHMARK_VERSION } from "../version";
import type { BenchmarkCase } from "../types";

const cases = [
  ["abandoned-session", "abandoned"],
  ["pending-72h", "pending_72h"],
  ["staff-touch-after-resolve", "staff_touched_after_resolve"],
  ["same-requester-24h-rereport", "same_requester_24h_rereport"],
  ["came-back-feedback", "came_back_feedback"],
  ["mixed-outcomes", "mixed"],
] as const;

export const honestMetricsCases: BenchmarkCase[] = cases.map(
  ([id, honestMetrics]) => ({
    id: `honest-metrics-${id}`,
    suite: "honest_metrics",
    version: BENCHMARK_VERSION,
    category: "metrics",
    platform: "general",
    ticket: {
      title: "Validate requester-agent outcome metrics",
      description:
        "Check that honest metrics classify session outcomes safely.",
    },
    evidence: [],
    honestMetrics,
    expected: {
      planner: "no_action",
      policy: "deny",
      executed: false,
    },
  })
);
