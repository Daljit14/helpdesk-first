import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentSession } from "@/lib/agent/types";

const { captureEnabled, createKnowledgeDraftForTicket } = vi.hoisted(() => ({
  captureEnabled: vi.fn(),
  createKnowledgeDraftForTicket: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isKnowledgeCaptureEnabled: captureEnabled,
}));
vi.mock("@/lib/knowledge/learning", () => ({
  createKnowledgeDraftForTicket,
}));

import { captureAgentResolution } from "./capture";

const session = {
  id: "session-1",
  organization_id: "org-1",
  status: "resolved",
  user_confirmed_at: "2026-01-01T00:00:00.000Z",
  security_flag: false,
  backing_ticket_id: "ticket-1",
  resolution_run_id: "run-1",
  verified_execution_id: "execution-1",
} as AgentSession;

function makeAdmin(
  options: {
    policyDecision?: string;
    resolutionReport?: unknown;
    verificationOutcome?: string;
    verificationExecutionId?: string;
    planSummary?: string | null;
    capabilityId?: string | null;
    planCapabilityId?: string;
    fail?: boolean;
  } = {}
) {
  const updates: Record<string, unknown>[] = [];
  const from = (table: string) => {
    if (options.fail) throw new Error("unavailable");
    const query: Record<string, (...args: unknown[]) => unknown> = {};
    const chain = () => query;
    query.select = chain;
    query.eq = chain;
    query.order = chain;
    query.limit = chain;
    query.is = chain;
    query.update = (value) => {
      updates.push(value as Record<string, unknown>);
      return query;
    };
    query.maybeSingle = async () => {
      if (table === "tickets") {
        return updates.length
          ? { data: { id: "ticket-1" }, error: null }
          : {
              data: {
                resolution_report: options.resolutionReport ?? null,
                reopen_count: 0,
              },
              error: null,
            };
      }
      if (table === "verification_results") {
        return {
          data: {
            outcome: options.verificationOutcome ?? "passed",
            method: "device_job_completed",
            execution_id: options.verificationExecutionId ?? "execution-1",
          },
          error: null,
        };
      }
      if (table === "capability_executions") {
        return options.capabilityId === null
          ? { data: null, error: null }
          : {
              data: {
                capability_id:
                  options.capabilityId ?? "collect_platform_context",
                capability_version: 1,
                step_id: "plan-step-1",
              },
              error: null,
            };
      }
      if (table === "resolution_steps") {
        return {
          data: {
            detail: {
              plan: {
                diagnosis: {
                  summary:
                    options.planSummary === undefined
                      ? "Evidence ev-1: The adapter recovered."
                      : options.planSummary,
                },
                capability:
                  options.capabilityId === null
                    ? null
                    : {
                        id:
                          options.planCapabilityId ??
                          options.capabilityId ??
                          "collect_platform_context",
                        version: 1,
                      },
              },
            },
          },
          error: null,
        };
      }
      return { data: null, error: null };
    };
    query.then = ((
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) =>
      Promise.resolve({
        data:
          table === "agent_steps"
            ? [{ policy_decision: options.policyDecision ?? "clean" }]
            : [],
        error: null,
      }).then(resolve, reject)) as (...args: unknown[]) => unknown;
    return query;
  };
  return { admin: { from }, updates };
}

beforeEach(() => {
  captureEnabled.mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("captureAgentResolution", () => {
  test("writes only deterministic verified data and enqueues an agent-session event", async () => {
    const { admin, updates } = makeAdmin();
    await captureAgentResolution(admin as never, session);
    expect(updates[0]).toEqual({
      resolution_report: {
        source: "agent_session",
        rootCause: "The adapter recovered.",
        actionsPerformed:
          "collect_platform_context; verification passed (device_job_completed).",
        toolsUsed: "collect_platform_context",
        preventiveRecommendation:
          "No preventive step recorded (agent resolution).",
      },
    });
    expect(createKnowledgeDraftForTicket).toHaveBeenCalledWith(
      admin,
      "ticket-1",
      "org-1",
      { sourceKind: "agent_session", agentSessionId: "session-1" }
    );
  });

  test("does not write for a tainted session or overwrite a staff report", async () => {
    const tainted = makeAdmin({ policyDecision: "external_untrusted" });
    await captureAgentResolution(tainted.admin as never, session);
    expect(tainted.updates).toEqual([]);
    expect(createKnowledgeDraftForTicket).not.toHaveBeenCalled();

    const staffReport = makeAdmin({
      resolutionReport: { rootCause: "Staff report" },
    });
    await captureAgentResolution(staffReport.admin as never, session);
    expect(staffReport.updates).toEqual([]);
    expect(createKnowledgeDraftForTicket).not.toHaveBeenCalled();
  });

  test.each([
    ["security-flagged session", { ...session, security_flag: true }, {}],
    ["missing backing ticket", { ...session, backing_ticket_id: null }, {}],
    ["failed verification", session, { verificationOutcome: "failed" }],
    [
      "verification for another execution",
      session,
      { verificationExecutionId: "unconfirmed-execution" },
    ],
    [
      "plan capability not linked to verified execution",
      session,
      { planCapabilityId: "unverified-capability" },
    ],
    ["missing report hypothesis", session, { planSummary: "" }],
    ["missing capability", session, { capabilityId: null }],
  ])("skips a %s", async (_label, target, options) => {
    const { admin, updates } = makeAdmin(options);
    await captureAgentResolution(admin as never, target as AgentSession);
    expect(updates).toEqual([]);
    expect(createKnowledgeDraftForTicket).not.toHaveBeenCalled();
  });

  test("never throws when the capture storage path fails", async () => {
    const failing = makeAdmin({ fail: true });
    await expect(
      captureAgentResolution(failing.admin as never, session)
    ).resolves.toBeUndefined();
    expect(createKnowledgeDraftForTicket).not.toHaveBeenCalled();
  });
});
