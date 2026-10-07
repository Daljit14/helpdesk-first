import { BENCHMARK_VERSION } from "../version";
import type { BenchmarkCase } from "../types";
import { REPLY_QUALITY_FIXTURES } from "./reply-quality-fixtures";

export const replyQualityCases: BenchmarkCase[] = REPLY_QUALITY_FIXTURES.map(
  (fixture) => ({
    id: `reply-quality-${fixture.id}`,
    suite: "requester_agent_reply_quality",
    version: BENCHMARK_VERSION,
    category: "reply_quality",
    platform: "general",
    ticket: { title: fixture.scenario, description: fixture.message },
    evidence: [],
    replyQuality: { fixtureId: fixture.id },
    expected: { planner: "no_action", executed: false },
  })
);
