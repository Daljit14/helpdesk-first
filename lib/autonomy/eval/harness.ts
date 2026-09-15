import { benchmarkCaseSchema, type BenchmarkCase } from "./benchmark/types";

export type BenchmarkHarness = {
  organizationId: string;
  ticketId: string;
  handlerCalls: number;
  executionInserts: number;
  allowedEvents: number;
  killSwitch: BenchmarkCase["killSwitch"] | null;
  replay: boolean;
  invokeHandler: () => never;
};

export function createBenchmarkHarness(
  benchmarkCase: BenchmarkCase
): BenchmarkHarness {
  benchmarkCaseSchema.parse(benchmarkCase);
  return {
    organizationId: "00000000-0000-4000-8000-000000000001",
    ticketId: "00000000-0000-4000-8000-000000000002",
    handlerCalls: 0,
    executionInserts: 0,
    allowedEvents: 0,
    killSwitch: benchmarkCase.killSwitch ?? null,
    replay: benchmarkCase.replay === true,
    invokeHandler: () => {
      throw new Error("Benchmark capability handler must never be invoked.");
    },
  };
}
