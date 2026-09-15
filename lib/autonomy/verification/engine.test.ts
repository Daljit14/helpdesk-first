import { beforeEach, describe, expect, test, vi } from "vitest";
import { assertTransition } from "../state-machine";
import type { ResolutionRun } from "../orchestrator";
import type { VerifierAdmin } from "./types";
import { verifyRun } from "./engine";

const mocks = vi.hoisted(() => ({
  transitionRun: vi.fn(),
  escalateRun: vi.fn(),
  writeRunEvent: vi.fn(async () => undefined),
  getCapability: vi.fn((id: string) => {
    const methods: Record<string, string> = {
      retry_failed_notification: "outbox_status_sent",
      generate_diagnosis_package: "escalation_package_present",
      request_user_verification: "user_verification_answer",
      rollback_capability: "outbox_status_sent",
    };
    const method = methods[id];
    return method
      ? {
          id,
          version: 1,
          verification: method,
          rollback: id === "rollback_capability" ? "compensating" : "none",
        }
      : null;
  }),
  rollbackExecution: vi.fn(),
}));
const { transitionRun, escalateRun, writeRunEvent, rollbackExecution } = mocks;

vi.mock("../orchestrator", () => ({
  transitionRun: mocks.transitionRun,
  escalateRun: mocks.escalateRun,
  writeRunEvent: mocks.writeRunEvent,
}));
vi.mock("../capabilities/registry", () => ({
  getCapability: mocks.getCapability,
}));
vi.mock("../rollback", () => ({
  rollbackExecution: mocks.rollbackExecution,
}));

const ORG = "00000000-0000-0000-0000-000000000001";
const TICKET = "00000000-0000-0000-0000-000000000002";
const EXECUTION = "00000000-0000-0000-0000-000000000003";
const RUN = "00000000-0000-0000-0000-000000000004";
const NOTIFICATION = "00000000-0000-0000-0000-000000000005";

function run(status: ResolutionRun["status"] = "verifying"): ResolutionRun {
  return {
    id: RUN,
    organization_id: ORG,
    ticket_id: TICKET,
    status,
    previous_status: null,
    attempts: 0,
    max_attempts: 3,
    cost_cents: 0,
    budget_cents: 50,
    deadline_at: "2030-01-01T00:00:00.000Z",
    initiated_by: "cron",
    planner_version: null,
    model: null,
    prompt_version: null,
    policy_version: null,
    escalation_reason: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    completed_at: null,
  };
}

type TableResult = {
  data?: unknown;
  error?: unknown;
  rows?: unknown[];
};

function query(result: TableResult = {}) {
  const value = {
    select: vi.fn(() => value),
    eq: vi.fn(() => value),
    order: vi.fn(() => value),
    limit: vi.fn(() => value),
    update: vi.fn(() => value),
    insert: vi.fn(async () => ({ data: null, error: null })),
    maybeSingle: vi.fn(async () => ({
      data: result.data ?? null,
      error: result.error ?? null,
    })),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: result.rows ?? [],
        error: result.error ?? null,
      }).then(resolve),
  };
  return value;
}

function adminFor(
  values: Record<string, TableResult | (() => TableResult)>
): VerifierAdmin {
  const queries = new Map<string, ReturnType<typeof query>>();
  return {
    from(table: string) {
      const cached = queries.get(table);
      if (cached) return cached;
      const value = values[table];
      const result = typeof value === "function" ? value() : (value ?? {});
      const created = query(result);
      queries.set(table, created);
      return created;
    },
  } as unknown as VerifierAdmin;
}

function execution(
  capabilityId: string,
  parameters: Record<string, unknown> = {}
) {
  return {
    id: EXECUTION,
    capability_id: capabilityId,
    capability_version: 1,
    parameters,
    status: "succeeded",
  };
}

beforeEach(() => {
  transitionRun.mockReset();
  escalateRun.mockReset();
  writeRunEvent.mockClear();
  rollbackExecution.mockReset();
  transitionRun.mockImplementation(
    async (
      _admin: unknown,
      value: ResolutionRun,
      to: ResolutionRun["status"]
    ) => {
      assertTransition(value.status, to);
      return { ...value, status: to };
    }
  );
  escalateRun.mockImplementation(
    async (_admin: unknown, value: ResolutionRun, reason: string) => ({
      ...value,
      status: "escalated",
      escalation_reason: reason,
    })
  );
});

describe("verification engine", () => {
  test("leaves non-verifying runs untouched", async () => {
    const value = run("planning");
    const result = await verifyRun(adminFor({}), value);
    expect(result).toBe(value);
    expect(transitionRun).not.toHaveBeenCalled();
    expect(escalateRun).not.toHaveBeenCalled();
  });

  test("requests pending verification once and is idempotent", async () => {
    const firstAdmin = adminFor({
      capability_executions: {
        data: execution("retry_failed_notification", {
          notificationId: NOTIFICATION,
        }),
      },
      verification_results: { data: null },
      notification_outbox: {
        data: { status: "sent", sent_at: "2030-01-01T00:00:00Z" },
      },
      tickets: {
        data: {
          status: "AI Resolving",
          verified_by_user: false,
          user_confirmed: false,
        },
      },
      resolution_events: { rows: [] },
    });
    const first = await verifyRun(firstAdmin, run());
    expect(first?.status).toBe("verifying");
    const ticketUpdate = firstAdmin.from("tickets").update;
    expect(ticketUpdate).toHaveBeenCalled();
    expect(writeRunEvent).toHaveBeenCalledWith(
      firstAdmin,
      expect.objectContaining({ kind: "verification.requested" })
    );

    const secondAdmin = adminFor({
      capability_executions: {
        data: execution("retry_failed_notification", {
          notificationId: NOTIFICATION,
        }),
      },
      verification_results: {
        data: {
          execution_id: EXECUTION,
          method: "outbox_status_sent",
          evidence: { status: "sent" },
          outcome: "passed",
          user_confirmed: false,
          verifier_version: "1",
        },
      },
      tickets: {
        data: {
          status: "Pending Verification",
          verified_by_user: false,
          user_confirmed: false,
        },
      },
      resolution_events: { rows: [{ id: "request-1" }] },
    });
    const second = await verifyRun(secondAdmin, run());
    expect(second?.status).toBe("verifying");
    expect(secondAdmin.from("tickets").update).not.toHaveBeenCalled();
  });

  test("confirmed requester transitions verified then resolved", async () => {
    const admin = adminFor({
      capability_executions: {
        data: execution("retry_failed_notification", {
          notificationId: NOTIFICATION,
        }),
      },
      verification_results: {
        data: {
          execution_id: EXECUTION,
          method: "outbox_status_sent",
          evidence: { status: "sent" },
          outcome: "passed",
          user_confirmed: false,
          verifier_version: "1",
        },
        rows: [{ id: "objective-passed" }],
      },
      tickets: {
        data: {
          status: "Resolved",
          verified_by_user: true,
          user_confirmed: true,
        },
      },
      resolution_events: { rows: [{ id: "request-1" }] },
    });
    const result = await verifyRun(admin, run());
    expect(result?.status).toBe("resolved");
    expect(transitionRun.mock.calls.map((call) => call[2])).toEqual([
      "verified",
      "resolved",
    ]);
    expect(admin.from("verification_results").insert).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "user_confirmation",
        outcome: "passed",
        user_confirmed: true,
      })
    );
    expect(writeRunEvent).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ kind: "run.resolved" })
    );
  });

  test("requester rejection fails the run", async () => {
    const admin = adminFor({
      capability_executions: {
        data: execution("retry_failed_notification", {
          notificationId: NOTIFICATION,
        }),
      },
      verification_results: {
        data: {
          execution_id: EXECUTION,
          method: "outbox_status_sent",
          evidence: { status: "sent" },
          outcome: "passed",
          user_confirmed: false,
          verifier_version: "1",
        },
      },
      tickets: {
        data: {
          status: "Needs Human",
          verified_by_user: false,
          user_confirmed: false,
        },
      },
      resolution_events: { rows: [{ id: "request-1" }] },
    });
    const result = await verifyRun(admin, run());
    expect(result?.status).toBe("failed");
    expect(transitionRun.mock.calls.at(-1)?.[2]).toBe("failed");
    expect(admin.from("verification_results").insert).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "user_confirmation",
        outcome: "failed",
        user_confirmed: false,
      })
    );
  });

  test("objective failure records unsupported rollback and fails", async () => {
    const admin = adminFor({
      capability_executions: {
        data: execution("rollback_capability", {
          notificationId: NOTIFICATION,
        }),
      },
      verification_results: { data: null },
      resolution_events: { rows: [] },
      tickets: {
        data: {
          status: "AI Resolving",
          verified_by_user: false,
          user_confirmed: false,
        },
      },
      notification_outbox: {
        data: { status: "failed", sent_at: null },
      },
    });
    const result = await verifyRun(admin, run());
    expect(result?.status).toBe("failed");
    expect(writeRunEvent).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        kind: "rollback.unsupported_in_5c",
        detail: { rollback: "compensating" },
      })
    );
  });

  test("objective failure uses rollback when enabled", async () => {
    vi.stubEnv("HELP_DESK_ROLLBACK_ENABLED", "true");
    rollbackExecution.mockResolvedValue({ ...run(), status: "escalated" });
    const admin = adminFor({
      capability_executions: {
        data: execution("rollback_capability", {
          notificationId: NOTIFICATION,
        }),
      },
      verification_results: { data: null },
      notification_outbox: {
        data: { status: "failed", sent_at: null },
      },
    });
    const result = await verifyRun(admin, run());
    expect(result?.status).toBe("escalated");
    expect(rollbackExecution).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ status: "verifying" }),
      EXECUTION,
      expect.objectContaining({ actor: "orchestrator" })
    );
    expect(writeRunEvent).not.toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ kind: "rollback.unsupported_in_5c" })
    );
  });

  test("informational pass returns to planning", async () => {
    const admin = adminFor({
      capability_executions: {
        data: execution("generate_diagnosis_package", { ticketId: TICKET }),
      },
      verification_results: { data: null },
      tickets: {
        data: {
          status: "Needs Human",
          escalation_package_at: "2030-01-01T00:00:00Z",
          verified_by_user: false,
          user_confirmed: false,
        },
      },
      resolution_events: { rows: [] },
    });
    const result = await verifyRun(admin, run());
    expect(result?.status).toBe("planning");
    expect(transitionRun.mock.calls.map((call) => call[2])).toEqual([
      "verified",
      "planning",
    ]);
  });

  test("informational pass escalates when attempts are exhausted", async () => {
    const admin = adminFor({
      capability_executions: {
        data: execution("generate_diagnosis_package", { ticketId: TICKET }),
      },
      verification_results: { data: null },
      tickets: {
        data: {
          status: "Needs Human",
          escalation_package_at: "2030-01-01T00:00:00Z",
          verified_by_user: false,
          user_confirmed: false,
        },
      },
      resolution_events: { rows: [] },
    });
    const result = await verifyRun(admin, { ...run(), attempts: 3 });
    expect(result?.status).toBe("escalated");
    expect(escalateRun).toHaveBeenCalledWith(
      admin,
      expect.anything(),
      "attempts_exhausted"
    );
  });

  test("blocks resolution when the passed result disappears", async () => {
    const admin = adminFor({
      capability_executions: {
        data: execution("retry_failed_notification", {
          notificationId: NOTIFICATION,
        }),
      },
      verification_results: {
        data: {
          execution_id: EXECUTION,
          method: "outbox_status_sent",
          evidence: { status: "sent" },
          outcome: "passed",
          user_confirmed: false,
          verifier_version: "1",
        },
        rows: [],
      },
      tickets: {
        data: {
          status: "Resolved",
          verified_by_user: true,
          user_confirmed: true,
        },
      },
      resolution_events: { rows: [{ id: "request-1" }] },
    });
    const result = await verifyRun(admin, run());
    expect(result?.status).toBe("verified");
    expect(transitionRun.mock.calls.map((call) => call[2])).toEqual([
      "verified",
    ]);
    expect(writeRunEvent).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        kind: "verification.resolution_blocked",
      })
    );
  });

  test("unknown verification method fails closed", async () => {
    const admin = adminFor({
      capability_executions: {
        data: {
          ...execution("unknown_capability"),
          capability_id: "unknown_capability",
        },
      },
      verification_results: { data: null },
    });
    const result = await verifyRun(admin, run());
    expect(result?.status).toBe("failed");
    expect(admin.from("verification_results").insert).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "failed",
        evidence: { reason: "unknown_verification_method" },
      })
    );
  });
});
