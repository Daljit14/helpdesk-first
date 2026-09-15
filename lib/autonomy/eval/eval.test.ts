import { describe, expect, test } from "vitest";
import { ISSUES } from "@/lib/issues";
import { benchmarkCaseSchema } from "./benchmark/types";
import { benchmarkCases } from "./benchmark/cases";
import { evaluateGates } from "./gates";
import { runBenchmark } from "./runner";

describe("versioned autonomy benchmark", () => {
  test("rejects extra fields at every strict case level", () => {
    const sample = benchmarkCases[0];
    expect(
      benchmarkCaseSchema.safeParse({ ...sample, unexpected: true }).success
    ).toBe(false);
    expect(
      benchmarkCaseSchema.safeParse({
        ...sample,
        ticket: { ...sample.ticket, unexpected: true },
      }).success
    ).toBe(false);
  });

  test("generates one catalog case for every issue guide", () => {
    expect(
      benchmarkCases.filter((item) => item.suite === "catalog")
    ).toHaveLength(ISSUES.length);
  });

  test("covers every required suite", () => {
    const suites = new Set(benchmarkCases.map((item) => item.suite));
    expect(
      [
        "catalog",
        "prompt_injection",
        "poisoned_attachment",
        "unsafe_requests",
        "unsupported_platform",
        "ambiguous",
        "tenant_attack",
        "replay",
        "provider_failure",
        "conflicting_evidence",
        "repeated_evidence",
        "kill_switch",
      ].every((suite) => suites.has(suite))
    ).toBe(true);
  });

  test("runs the committed benchmark", async () => {
    const report = await runBenchmark();
    expect(report.cases).toBe(benchmarkCases.length);
    expect(
      Object.values(report.suites).every((suite) => suite.failed === 0)
    ).toBe(true);
    expect(report.gates.every((gate) => gate.passed)).toBe(true);
  });

  test("shows evaluated counts for seeded gate failures", () => {
    const [gate] = evaluateGates([
      {
        caseId: "bad",
        suite: "seeded",
        planner: "propose_action",
        policy: "allow_automatic",
        executed: true,
        inputBlocked: false,
        outputRejected: false,
        replay: false,
        foreignIds: true,
        handlerCalls: 1,
        capabilityEnabled: false,
        verificationPassed: false,
        consentSatisfied: false,
        failedExecutionTerminal: false,
        providerPolicy: "allow_automatic",
        okPolicy: "allow_automatic",
        unsafeModelSink: true,
        latencyMs: 1,
      },
    ]);
    expect(gate.passed).toBe(false);
    expect(gate.evaluated).toBe(1);
  });
});
