import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  readKillSwitches: vi.fn(),
  event: vi.fn(),
  isEscalationPackageEnabled: vi.fn(),
  snapshotEscalationPackage: vi.fn(),
  snapshotEvidence: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("./kill-switches", () => ({
  readKillSwitches: mocks.readKillSwitches,
}));
vi.mock("@/lib/tickets/events", () => ({ event: mocks.event }));
vi.mock("@/lib/investigation/config", () => ({
  isEscalationPackageEnabled: mocks.isEscalationPackageEnabled,
}));
vi.mock("@/lib/investigation/escalation", () => ({
  snapshotEscalationPackage: mocks.snapshotEscalationPackage,
}));
vi.mock("@/lib/evidence/snapshot", () => ({
  snapshotEvidence: mocks.snapshotEvidence,
}));

import {
  processDueRuns,
  reapExpiredLeases,
  startRun,
  transitionRun,
  type ResolutionRun,
} from "./orchestrator";

function makeQuery(options: {
  data?: unknown;
  error?: unknown;
  single?: { data?: unknown; error?: unknown };
  maybeSingle?: { data?: unknown; error?: unknown };
}) {
  const result = { data: options.data ?? null, error: options.error ?? null };
  const query = {
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    not: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    lt: vi.fn(() => query),
    single: vi.fn(async () => options.single ?? options.maybeSingle ?? result),
    maybeSingle: vi.fn(async () => options.maybeSingle ?? result),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return query;
}

const run: ResolutionRun = {
  id: "run-1",
  organization_id: "org-1",
  ticket_id: "ticket-1",
  status: "queued",
  previous_status: null,
  attempts: 0,
  max_attempts: 3,
  cost_cents: 0,
  budget_cents: 50,
  deadline_at: new Date(Date.now() + 60_000).toISOString(),
  initiated_by: "ai",
  planner_version: null,
  model: null,
  prompt_version: null,
  policy_version: null,
  escalation_reason: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  completed_at: null,
};

function makeAdmin(queries: Record<string, ReturnType<typeof makeQuery>>) {
  const from = vi.fn((table: string) => queries[table]);
  return { from };
}

describe("resolution orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("HELP_DESK_AUTONOMY_ENABLED", "true");
    vi.stubEnv("HELP_DESK_EVIDENCE_ENGINE_ENABLED", "false");
    mocks.readKillSwitches.mockResolvedValue({
      global: false,
      organization: false,
      capability: false,
      anyActive: false,
      reasons: [],
    });
    mocks.isEscalationPackageEnabled.mockReturnValue(false);
    mocks.event.mockResolvedValue(undefined);
    mocks.snapshotEscalationPackage.mockResolvedValue(null);
    mocks.snapshotEvidence.mockResolvedValue(null);
  });

  test("returns the active run on duplicate start", async () => {
    const runs = makeQuery({
      single: { data: null, error: { code: "23505" } },
      maybeSingle: { data: run, error: null },
    });
    const admin = makeAdmin({
      resolution_runs: runs,
      resolution_events: makeQuery({}),
    });
    const result = await startRun(admin as never, {
      ticketId: "ticket-1",
      organizationId: "org-1",
      initiatedBy: "ai",
    });
    expect(result).toEqual({ run, created: false });
    expect(runs.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  test("transition filters updates by organization and writes an event", async () => {
    const runs = makeQuery({
      single: { data: { ...run, status: "investigating" }, error: null },
    });
    const events = makeQuery({});
    const admin = makeAdmin({
      resolution_runs: runs,
      resolution_events: events,
    });
    const result = await transitionRun(admin as never, run, "investigating", {
      actor: "worker",
    });
    expect(result?.status).toBe("investigating");
    expect(runs.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        from_status: "queued",
        to_status: "investigating",
      })
    );
  });

  test("kill switch pauses rather than transitions", async () => {
    mocks.readKillSwitches.mockResolvedValue({
      global: true,
      organization: false,
      capability: false,
      anyActive: true,
      reasons: ["maintenance"],
    });
    const runs = makeQuery({
      single: { data: { ...run, status: "paused" }, error: null },
    });
    const events = makeQuery({});
    const admin = makeAdmin({
      resolution_runs: runs,
      resolution_events: events,
    });
    const result = await transitionRun(admin as never, run, "investigating", {
      actor: "worker",
    });
    expect(result?.status).toBe("paused");
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "security.kill_switch" })
    );
  });

  test("manual pause preserves the prior status and resumes it", async () => {
    const runs = makeQuery({
      single: { data: { ...run, status: "paused" }, error: null },
    });
    const events = makeQuery({});
    const admin = makeAdmin({
      resolution_runs: runs,
      resolution_events: events,
    });
    await transitionRun(
      admin as never,
      { ...run, status: "investigating" },
      "paused",
      {
        actor: "staff-1",
        detail: { reason: "staff pause" },
      }
    );
    expect(runs.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: "paused",
        previous_status: "investigating",
      })
    );

    await transitionRun(
      admin as never,
      { ...run, status: "paused", previous_status: "investigating" },
      "investigating",
      { actor: "staff-1" }
    );
    expect(runs.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "investigating" })
    );
  });

  test("deadline escalation updates the ticket with organization scope", async () => {
    const expired = {
      ...run,
      deadline_at: new Date(Date.now() - 1).toISOString(),
    };
    const runs = makeQuery({
      single: { data: { ...expired, status: "escalated" }, error: null },
    });
    const tickets = makeQuery({});
    const events = makeQuery({});
    const admin = makeAdmin({
      resolution_runs: runs,
      tickets,
      resolution_events: events,
    });
    const result = await transitionRun(
      admin as never,
      expired,
      "investigating",
      {
        actor: "worker",
      }
    );
    expect(result?.status).toBe("escalated");
    expect(tickets.eq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(mocks.event).toHaveBeenCalledWith(
      "ticket-1",
      "org-1",
      "ai.escalated",
      "ai",
      null,
      expect.objectContaining({ reason: "limits_exceeded" })
    );
  });

  test("illegal transitions throw before writing", async () => {
    const runs = makeQuery({});
    const events = makeQuery({});
    const admin = makeAdmin({
      resolution_runs: runs,
      resolution_events: events,
    });
    await expect(
      transitionRun(
        admin as never,
        { ...run, status: "executing" },
        "resolved",
        {
          actor: "worker",
        }
      )
    ).rejects.toThrow("Illegal autonomy transition");
    expect(runs.update).not.toHaveBeenCalled();
    expect(events.insert).not.toHaveBeenCalled();
  });

  test("worker escalates planner states until planner exists", async () => {
    const runs = makeQuery({
      data: [{ ...run, status: "investigating" }],
      single: { data: { ...run, status: "escalated" }, error: null },
    });
    const tickets = makeQuery({});
    const events = makeQuery({});
    const admin = makeAdmin({
      resolution_runs: runs,
      tickets,
      resolution_events: events,
    });
    const summary = await processDueRuns(admin as never);
    expect(summary).toEqual({ processed: 1, paused: 0, escalated: 1 });
    expect(tickets.update).toHaveBeenCalledWith(
      expect.objectContaining({ handoff_reason: "planner_not_available" })
    );
  });

  test("worker snapshots evidence when a queued run starts", async () => {
    vi.stubEnv("HELP_DESK_EVIDENCE_ENGINE_ENABLED", "true");
    const runs = makeQuery({ data: [{ ...run, status: "queued" }] });
    const events = makeQuery({});
    const admin = makeAdmin({
      resolution_runs: runs,
      resolution_events: events,
    });
    mocks.snapshotEvidence.mockResolvedValue({
      hypotheses: [{ confidence: 0.72 }],
      missingInformation: ["platform"],
    });

    await processDueRuns(admin as never);

    expect(mocks.snapshotEvidence).toHaveBeenCalledWith(
      admin,
      "ticket-1",
      "org-1"
    );
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "evidence.snapshot",
        detail: {
          hypotheses: 1,
          topConfidence: 0.72,
          missingInformation: ["platform"],
        },
      })
    );
  });

  test("worker escalates failed runs with run_failed", async () => {
    const runs = makeQuery({
      data: [{ ...run, status: "failed" }],
      single: { data: { ...run, status: "escalated" }, error: null },
    });
    const tickets = makeQuery({});
    const events = makeQuery({});
    const admin = makeAdmin({
      resolution_runs: runs,
      tickets,
      resolution_events: events,
    });
    const summary = await processDueRuns(admin as never);
    expect(summary).toEqual({ processed: 1, paused: 0, escalated: 1 });
    expect(tickets.update).toHaveBeenCalledWith(
      expect.objectContaining({ handoff_reason: "run_failed" })
    );
  });

  test("reaper times out a step and escalates its run", async () => {
    const steps = makeQuery({
      data: [
        {
          id: "step-1",
          organization_id: "org-1",
          run_id: "run-1",
          lease_until: new Date(Date.now() - 1).toISOString(),
        },
      ],
    });
    const runs = makeQuery({
      maybeSingle: { data: { ...run, status: "executing" }, error: null },
      single: { data: { ...run, status: "escalated" }, error: null },
    });
    const tickets = makeQuery({});
    const events = makeQuery({});
    const admin = makeAdmin({
      resolution_steps: steps,
      resolution_runs: runs,
      tickets,
      resolution_events: events,
    });
    const result = await reapExpiredLeases(admin as never);
    expect(result).toEqual({ reaped: 1 });
    expect(steps.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "timed_out" })
    );
    expect(tickets.update).toHaveBeenCalledWith(
      expect.objectContaining({ handoff_reason: "worker_lease_expired" })
    );
  });

  test("planner shadow mode records the plan and escalates without executing", async () => {
    vi.stubEnv("HELP_DESK_PLANNER_ENABLED", "true");
    vi.stubEnv("HELP_DESK_PLANNER_MODE", "shadow");
    vi.stubEnv("HELP_DESK_CAPABILITY_REGISTRY_ENABLED", "true");
    vi.stubEnv("HELP_DESK_CAP_SEARCH_APPROVED_KNOWLEDGE_ENABLED", "true");

    const planning = { ...run, status: "planning" as const };
    const escalated = { ...run, status: "escalated" as const };
    const runs = makeQuery({
      data: [{ ...run, status: "investigating" }],
      single: { data: planning, error: null },
    });
    runs.single
      .mockResolvedValueOnce({ data: planning, error: null })
      .mockResolvedValueOnce({ data: escalated, error: null });
    const tickets = makeQuery({
      maybeSingle: {
        data: { id: run.ticket_id, category: "email", platform: "Mac" },
        error: null,
      },
    });
    const notifications = makeQuery({
      maybeSingle: { data: null, error: null },
    });
    const executions = makeQuery({ data: [] });
    const orgCapabilities = makeQuery({
      data: [
        {
          capability_id: "search_approved_knowledge",
          min_version: 1,
          enabled: true,
        },
      ],
      maybeSingle: { data: { min_version: 1, enabled: true }, error: null },
    });
    const versions = makeQuery({
      maybeSingle: { data: { status: "active" }, error: null },
    });
    const steps = makeQuery({
      single: { data: { id: "step-plan" }, error: null },
    });
    const events = makeQuery({});
    const policyDecisions = makeQuery({});
    const admin = makeAdmin({
      resolution_runs: runs,
      tickets,
      notification_outbox: notifications,
      capability_executions: executions,
      organization_capabilities: orgCapabilities,
      capability_versions: versions,
      resolution_steps: steps,
      resolution_events: events,
      policy_decisions: policyDecisions,
    });

    const summary = await processDueRuns(admin as never);

    expect(summary).toEqual({ processed: 1, paused: 0, escalated: 1 });
    expect(events.insert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "plan.shadow" })
    );
    expect(policyDecisions.insert).toHaveBeenCalledWith(
      expect.objectContaining({ reasons: ["shadow_mode"] })
    );
    expect(tickets.update).toHaveBeenCalledWith(
      expect.objectContaining({ handoff_reason: "shadow_mode" })
    );
  });
});
