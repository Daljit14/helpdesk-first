import { describe, expect, test, vi } from "vitest";
import { ISSUES } from "@/lib/issues";
import { benchmarkCaseSchema } from "./benchmark/types";
import { benchmarkCases } from "./benchmark/cases";
import { evaluateGates } from "./gates";
import { runBenchmark } from "./runner";

const handlerMocks = vi.hoisted(() => ({
  getHandler: vi.fn(),
}));

vi.mock("../executor/handlers", () => handlerMocks);
vi.mock("../capabilities/enablement", () => ({
  isCapabilityEnabled: vi.fn(async () => true),
}));

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

  test.each([
    ["zero_unauthorized_executions", { executionInserts: 1 }],
    ["zero_cross_tenant_exposure", { foreignIds: true }],
    ["enabled_capability_versions", { capabilityEnabled: false }],
    [
      "verification_before_resolution",
      { executed: true, runResolved: true, verificationPassed: false },
    ],
    ["consent_or_no_execution", { executed: true, consentSatisfied: false }],
    [
      "failed_execution_terminal_or_rolled_back",
      { failedExecutionTerminal: false },
    ],
    [
      "provider_failure_not_less_restrictive",
      { providerPolicy: "allow_automatic", okPolicy: "deny" },
    ],
    ["no_unsafe_model_sink", { unsafeModelSink: true }],
    [
      "irreversible_device_action_requires_consent",
      {
        capability: { id: "device_cleanup_temp_files", version: 1 },
        policy: "allow_automatic",
        consentSatisfied: false,
      },
    ],
  ])("detects a seeded %s failure", (name, override) => {
    const result = {
      caseId: "bad",
      suite: "seeded",
      redTeam: false,
      planner: "propose_action",
      capability: { id: "search_approved_knowledge", version: 1 },
      policy: "allow_automatic",
      verificationMethod: "none",
      executed: false,
      inputBlocked: false,
      outputRejected: false,
      rejectCode: null,
      gatewayCode: null,
      replay: false,
      foreignIds: false,
      handlerCalls: 0,
      executionInserts: 0,
      deviceJobInserts: 0,
      allowedEvents: 0,
      capabilityEnabled: true,
      runResolved: false,
      verificationPassed: true,
      consentSatisfied: true,
      failedExecutionTerminal: true,
      providerPolicy: null,
      okPolicy: null,
      unsafeModelSink: false,
      identityBound: false,
      identityCapability: false,
      directoryWriteCalls: 0,
      latencyMs: 1,
      researchPresent: false,
      researchInfluencedNonSafe: false,
      ...override,
    };
    const gate = evaluateGates([result]).find((item) => item.name === name);
    expect(gate).toMatchObject({ passed: false, evaluated: 1 });
    expect(
      evaluateGates([result])
        .filter((item) => !item.passed)
        .map((item) => item.name)
    ).toEqual([name]);
  });

  test("proves replay and kill switches stop before handlers", async () => {
    const handler = { run: vi.fn(async () => ({ ok: true })) };
    handlerMocks.getHandler.mockReturnValue(handler);
    vi.stubEnv("HELP_DESK_AUTONOMY_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv(
      "HELP_DESK_AUTONOMY_ORG_ALLOWLIST",
      "00000000-0000-4000-8000-000000000001"
    );
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    try {
      const replay = benchmarkCases.find((item) => item.suite === "replay");
      expect(replay).toBeDefined();
      const replayReport = await runBenchmark([replay!]);
      expect(replayReport.results[0]?.gatewayCode).toBe("allowed");
      for (const item of benchmarkCases.filter(
        (value) => value.suite === "kill_switch"
      )) {
        const report = await runBenchmark([item]);
        expect(report.results[0]?.gatewayCode).toBe(
          item.killSwitch === "breaker" ? "breaker_open" : "kill_switch_active"
        );
      }
      expect(handler.run).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test("exercises every red-team case through the enabled gateway", async () => {
    const handler = { run: vi.fn(async () => ({ ok: true })) };
    handlerMocks.getHandler.mockReturnValue(handler);
    vi.stubEnv("HELP_DESK_AUTONOMY_ENABLED", "true");
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    vi.stubEnv(
      "HELP_DESK_AUTONOMY_ORG_ALLOWLIST",
      "00000000-0000-4000-8000-000000000001"
    );
    vi.stubEnv("HELP_DESK_GUARDRAILS_ENFORCED", "true");
    const redTeamCases = benchmarkCases.filter((item) =>
      item.suite.startsWith("redteam_")
    );
    try {
      expect(redTeamCases.length).toBeGreaterThan(0);
      for (const item of redTeamCases) {
        if (item.pilot) {
          vi.stubEnv(
            "HELP_DESK_PILOT_CAPABILITY_ALLOWLIST",
            "capability-not-in-this-list"
          );
        } else {
          vi.stubEnv(
            "HELP_DESK_PILOT_CAPABILITY_ALLOWLIST",
            item.suite === "redteam_consent" ||
              item.suite === "redteam_attachment"
              ? "retry_failed_notification"
              : item.suite === "redteam_identity"
                ? [
                    "check_account_status",
                    "verify_group_access",
                    "revoke_user_sessions",
                    "grant_group_access",
                  ].join(",")
                : "search_approved_knowledge"
          );
        }
        const report = await runBenchmark([item]);
        expect(item.expected.gatewayCode).toBeDefined();
        expect(report.results[0]?.gatewayCode).toBe(item.expected.gatewayCode);
        expect(report.results[0]?.executed).toBe(false);
        if (item.suite === "redteam_identity")
          expect(report.results[0]?.directoryWriteCalls).toBe(0);
      }
      expect(handler.run).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
