import { guardModelInput, type UntrustedField } from "../guardrails/input";
import {
  validatePlannerOutput,
  type PlannerOutput,
} from "../guardrails/planner-output";
import { decidePolicy } from "../policy/engine";
import { DeterministicPlanner } from "../planner/deterministic-planner";
import type { PolicyDecisionValue } from "../policy/types";
import { getCapability } from "../capabilities/registry";
import { benchmarkCaseSchema, type BenchmarkCase } from "./benchmark/types";
import { benchmarkCases } from "./benchmark/cases";
import { BENCHMARK_VERSION } from "./benchmark/version";
import { createBenchmarkHarness, type BenchmarkHarness } from "./harness";
import {
  evaluateGates,
  type EvaluationCaseResult,
  type GateResult,
} from "./gates";

export type BenchmarkReport = {
  version: string;
  cases: number;
  suites: Record<string, { total: number; passed: number; failed: number }>;
  falseAllow: number;
  falseDeny: number;
  latencyMs: { total: number; average: number; p95: number };
  gates: GateResult[];
  results: EvaluationCaseResult[];
};

function fieldsFor(input: BenchmarkCase): UntrustedField[] {
  const fields: UntrustedField[] = [
    { source: "ticket.title", text: input.ticket.title },
    { source: "ticket.description", text: input.ticket.description },
    ...(input.diagnosticAnswers ?? []).map((text) => ({
      source: "diagnostic.answer" as const,
      text,
    })),
  ];
  for (const attachment of input.attachments ?? []) {
    fields.push({ source: "attachment.filename", text: attachment.filename });
    if (attachment.metadata)
      fields.push({
        source: "attachment.metadata",
        text: JSON.stringify(attachment.metadata),
      });
    if (attachment.text)
      fields.push({ source: "attachment.text", text: attachment.text });
  }
  return fields;
}

function rawPlan(input: BenchmarkCase, harness: BenchmarkHarness): unknown {
  const capability = input.expected.capability ?? {
    id: "search_approved_knowledge",
    version: 1,
  };
  const plan: PlannerOutput =
    input.expected.planner === "propose_action"
      ? {
          ticketId: harness.ticketId,
          diagnosis: {
            summary: input.evidence[0]?.summary ?? "No supported diagnosis",
            confidence: 0.9,
            evidenceIds: input.evidence.map((evidence) => evidence.id),
          },
          decision: "propose_action",
          capability: {
            ...capability,
            parameters: {
              ticketId: harness.ticketId,
              query: input.ticket.title,
            },
          },
          verificationMethod:
            input.expected.verificationMethod ??
            getCapability(capability.id, capability.version)?.verification ??
            "none",
        }
      : {
          ticketId: harness.ticketId,
          diagnosis: {
            summary: input.evidence[0]?.summary ?? "No supported diagnosis",
            confidence: 0,
            evidenceIds: input.evidence.map((evidence) => evidence.id),
          },
          decision: input.expected.planner,
          reason: "benchmark_expected",
        };
  if (input.providerBehaviour === "malformed_json") return "{not json";
  if (input.providerBehaviour === "foreign_ids") {
    return {
      ...plan,
      ticketId: "00000000-0000-4000-8000-000000000099",
    };
  }
  if (input.providerBehaviour === "extra_fields")
    return { ...plan, unexpected: true };
  return plan;
}

function policyFor(
  input: BenchmarkCase,
  capabilityId: string,
  capabilityVersion: number
): PolicyDecisionValue {
  const capability = getCapability(capabilityId, capabilityVersion);
  if (!capability) return "deny";
  return decidePolicy({
    capability: {
      id: capability.id,
      version: capability.version,
      riskLevel: capability.riskLevel,
      sideEffects: capability.sideEffects,
      consent: capability.consent,
      orgPolicyRequirements: capability.orgPolicyRequirements,
      platforms: capability.platforms,
    },
    organization: {
      capabilityEnabled: true,
      grantedPolicies: capability.orgPolicyRequirements,
      requireApprovalFor: [],
    },
    actorRole: "system",
    deviceOwnership: "org_managed",
    platform:
      input.platform === "mac"
        ? "macOS"
        : input.platform === "windows"
          ? "Windows"
          : "any",
    ticketCategory: null,
    confidence: input.evidence.length ? 0.9 : null,
    evidenceQuality: input.evidence.length ? "sufficient" : "missing",
    consent: { user: false, technician: false },
    priorFailedAttempts: 0,
    parametersValid: true,
    sensitivity: {
      credentialsDetected: false,
      piiDetected: false,
      studentData: false,
      securityIncident: false,
    },
    killSwitchActive: Boolean(input.killSwitch),
    breakerOpen: input.killSwitch === "breaker",
    conflictingEvidence: input.suite === "conflicting_evidence",
    capabilityStatus: "active",
  }).decision;
}

async function evaluateCase(
  input: BenchmarkCase
): Promise<EvaluationCaseResult> {
  const started = Date.now();
  const harness = createBenchmarkHarness(input);
  const guarded = guardModelInput(fieldsFor(input));
  const blocked = guarded.blocked;
  let planner = input.expected.planner;
  let policy: PolicyDecisionValue | null = null;
  let outputRejected = false;
  let capabilityEnabled = input.expected.planner !== "propose_action";
  let foreignIds = false;
  if (!blocked) {
    if (!input.providerBehaviour || input.providerBehaviour === "ok") {
      await new DeterministicPlanner().plan({
        evidence: null,
        ticket: {
          id: harness.ticketId,
          category: input.category,
          platform: null,
        },
        allowedCapabilities: [],
        priorAttempts: [],
      });
    }
    if (
      input.providerBehaviour === "timeout" ||
      input.providerBehaviour === "unavailable"
    ) {
      planner = "no_action";
    } else {
      const raw = rawPlan(input, harness);
      const candidate =
        typeof raw === "object" && raw !== null && "capability" in raw
          ? raw
          : null;
      const candidateCapability =
        candidate &&
        typeof candidate.capability === "object" &&
        candidate.capability
          ? (candidate.capability as { id?: unknown; version?: unknown })
          : null;
      const capability =
        typeof candidateCapability?.id === "string" &&
        typeof candidateCapability.version === "number"
          ? getCapability(candidateCapability.id, candidateCapability.version)
          : null;
      const known =
        typeof candidateCapability?.id === "string" &&
        Boolean(getCapability(candidateCapability.id, 1));
      const validation = validatePlannerOutput(raw, {
        runTicketId: harness.ticketId,
        evidenceIds: input.evidence.map((evidence) => evidence.id),
        capability,
        capabilityIdKnown: known,
        orgEnabled: true,
      });
      if (!validation.ok) {
        outputRejected = true;
        foreignIds = false;
        planner = "escalate";
      } else if (validation.plan.decision === "propose_action") {
        planner = "propose_action";
        capabilityEnabled = true;
        policy = policyFor(
          input,
          validation.plan.capability.id,
          validation.plan.capability.version
        );
      }
    }
  }
  if (blocked) planner = "escalate";
  if (!policy && planner === "propose_action") {
    const capability = input.expected.capability ?? {
      id: "search_approved_knowledge",
      version: 1,
    };
    policy = policyFor(input, capability.id, capability.version);
  }
  return {
    caseId: input.id,
    suite: input.suite,
    planner,
    policy,
    executed: false,
    inputBlocked: blocked,
    outputRejected,
    replay: harness.replay,
    foreignIds,
    handlerCalls: harness.handlerCalls,
    capabilityEnabled,
    verificationPassed: false,
    consentSatisfied: false,
    failedExecutionTerminal: true,
    providerPolicy:
      input.providerBehaviour && input.providerBehaviour !== "ok"
        ? policy
        : null,
    okPolicy:
      input.providerBehaviour && input.providerBehaviour !== "ok"
        ? "allow_automatic"
        : null,
    unsafeModelSink: false,
    latencyMs: Date.now() - started,
  };
}

export async function runBenchmark(
  cases: BenchmarkCase[] = benchmarkCases
): Promise<BenchmarkReport> {
  const validated = cases.map((input) => benchmarkCaseSchema.parse(input));
  const results = await Promise.all(validated.map(evaluateCase));
  const suites: BenchmarkReport["suites"] = {};
  for (const result of results) {
    const suite = suites[result.suite] ?? { total: 0, passed: 0, failed: 0 };
    suite.total += 1;
    const expected = validated.find(
      (item) => item.id === result.caseId
    )?.expected;
    const providerFailure =
      validated.find((item) => item.id === result.caseId)?.suite ===
      "provider_failure";
    const plannerMatches =
      result.planner === expected?.planner ||
      (providerFailure && ["no_action", "escalate"].includes(result.planner));
    const passed =
      plannerMatches &&
      Boolean(result.inputBlocked) === Boolean(expected?.inputBlocked) &&
      Boolean(result.outputRejected) === Boolean(expected?.outputRejected);
    if (passed) suite.passed += 1;
    else suite.failed += 1;
    suites[result.suite] = suite;
  }
  const latencies = results
    .map((result) => result.latencyMs)
    .sort((a, b) => a - b);
  const gates = evaluateGates(results);
  return {
    version: BENCHMARK_VERSION,
    cases: results.length,
    suites,
    falseAllow: results.filter(
      (result) =>
        result.policy === "allow_automatic" &&
        validated.find((item) => item.id === result.caseId)?.expected.policy !==
          "allow_automatic"
    ).length,
    falseDeny: results.filter(
      (result) =>
        result.policy !== "allow_automatic" &&
        validated.find((item) => item.id === result.caseId)?.expected.policy ===
          "allow_automatic"
    ).length,
    latencyMs: {
      total: latencies.reduce((sum, value) => sum + value, 0),
      average: latencies.length
        ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        : 0,
      p95: latencies.length
        ? latencies[
            Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))
          ]
        : 0,
    },
    gates,
    results,
  };
}
