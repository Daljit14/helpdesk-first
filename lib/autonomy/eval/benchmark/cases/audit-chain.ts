import type { BenchmarkCase } from "../types";
import { BENCHMARK_VERSION } from "../version";

const base = {
  version: BENCHMARK_VERSION,
  platform: "general" as const,
  ticket: {
    title: "Verify append-only audit records",
    description: "Confirm audit records remain verifiable.",
  },
  evidence: [],
};

export const auditChainCases: BenchmarkCase[] = [
  {
    ...base,
    id: "audit-chain-intact",
    suite: "audit_chain",
    category: "security",
    auditChain: "intact",
    expected: {
      planner: "no_action",
      auditChainOk: true,
      executed: false,
    },
  },
  {
    ...base,
    id: "audit-chain-middle-deletion",
    suite: "audit_chain",
    category: "security",
    auditChain: "delete_middle",
    expected: {
      planner: "no_action",
      auditChainOk: false,
      auditChainFirstBreakId: "20000000-0000-4000-8000-000000000004",
      executed: false,
    },
  },
];
