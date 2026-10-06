import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  checkHourlyLimits,
  evaluateBlastRadius,
  recordBlastRadiusOutcome,
} from "./blast-radius";
import type { BlastRadiusLimits, BlastRadiusEvent } from "./blast-radius";
import { getAutonomyLimits } from "./config";

const mocks = vi.hoisted(() => ({
  alertSecurityEvent: vi.fn(),
  setKillSwitch: vi.fn(),
}));

vi.mock("./alerts", () => ({ alertSecurityEvent: mocks.alertSecurityEvent }));
vi.mock("./kill-switches", () => ({ setKillSwitch: mocks.setKillSwitch }));

const limits: BlastRadiusLimits = {
  failures: 3,
  failureRate: 0.5,
  minRuns: 4,
  windowMs: 10_000,
};

function event(
  id: string,
  capabilityId = "device_flush_dns",
  overrides: Partial<BlastRadiusEvent> = {}
): BlastRadiusEvent {
  return {
    executionId: id,
    capabilityId,
    organizationId: "org-1",
    runId: "run-1",
    at: 10_000,
    failed: true,
    ...overrides,
  };
}

function queryAdmin(
  rows: Record<string, unknown>[] = [],
  tableRows: Record<string, Record<string, unknown>[]> = {},
  options: {
    queryErrors?: Record<string, { message: string }>;
    throwOnQueryTable?: string;
    auditInsertError?: boolean;
  } = {}
) {
  const inserts = new Map<string, Record<string, unknown>[]>();
  const from = vi.fn((table: string) => {
    if (table === options.throwOnQueryTable)
      throw new Error("private query failure");
    let data =
      table === "capability_executions" ? rows : (tableRows[table] ?? []);
    const query: Record<string, (...args: unknown[]) => unknown> = {};
    query.select = () => query;
    query.eq = (column, value) => {
      data = data.filter((row) => row[String(column)] === value);
      return query;
    };
    query.in = (column, values) => {
      data = data.filter((row) =>
        (values as unknown[]).includes(row[String(column)])
      );
      return query;
    };
    query.is = (column, value) => {
      data = data.filter((row) => row[String(column)] === value);
      return query;
    };
    query.gte = (column, value) => {
      data = data.filter(
        (row) =>
          typeof row[String(column)] === "string" &&
          String(row[String(column)]) >= String(value)
      );
      return query;
    };
    query.order = () => query;
    query.limit = () => query;
    query.maybeSingle = async () => ({
      data: data[0] ?? null,
      error: options.queryErrors?.[table] ?? null,
    });
    query.insert = async (payload) => {
      if (table === "resolution_events" && options.auditInsertError)
        return { data: null, error: { message: "audit insert failed" } };
      const current = inserts.get(table) ?? [];
      current.push(
        ...(Array.isArray(payload)
          ? payload
          : [payload as Record<string, unknown>])
      );
      inserts.set(table, current);
      return { data: null, error: null };
    };
    query.update = () => query;
    query.then = ((resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data,
        error: options.queryErrors?.[table] ?? null,
      }).then(resolve)) as unknown as (...args: unknown[]) => unknown;
    return query;
  });
  return { from, inserts };
}

describe("evaluateBlastRadius", () => {
  test("uses inclusive window boundaries and counts each execution once", () => {
    const result = evaluateBlastRadius(
      [
        event("first", "cap-a", { at: 0 }),
        event("first", "cap-a", { at: 0, failed: false }),
        event("last", "cap-a", { at: 10_000 }),
        event("outside", "cap-a", { at: -1 }),
      ],
      10_000,
      { ...limits, failures: 2, failureRate: 1 }
    );
    expect(result).toMatchObject({
      trip: true,
      scope: "capability",
      capabilityIds: ["cap-a"],
    });
  });

  test("requires the minimum run count for a rate trip", () => {
    expect(
      evaluateBlastRadius([event("one"), event("two")], 10_000, {
        ...limits,
        failures: 10,
        minRuns: 3,
        failureRate: 0.5,
      }).trip
    ).toBe(false);
  });

  test("trips at the absolute failure count and the minimum-run rate threshold", () => {
    const fiveOfOneHundred = Array.from({ length: 100 }, (_, index) =>
      event(`absolute-${index}`, "cap-a", {
        failed: index < 5,
        at: 10_000 - index,
      })
    );
    expect(
      evaluateBlastRadius(fiveOfOneHundred, 10_000, {
        failures: 5,
        failureRate: 0.3,
        minRuns: 5,
        windowMs: 10_000,
      }).trip
    ).toBe(true);

    const fiveRuns = Array.from({ length: 5 }, (_, index) =>
      event(`rate-${index}`, "cap-a", {
        failed: index < 2,
        at: 10_000 - index,
      })
    );
    expect(
      evaluateBlastRadius(fiveRuns, 10_000, {
        failures: 99,
        failureRate: 0.4,
        minRuns: 5,
        windowMs: 10_000,
      }).trip
    ).toBe(true);
  });

  test("does not rate-trip before the minimum run count", () => {
    const fourRuns = Array.from({ length: 4 }, (_, index) =>
      event(`four-${index}`, "cap-a", {
        failed: index < 3,
        at: 10_000 - index,
      })
    );
    expect(
      evaluateBlastRadius(fourRuns, 10_000, {
        failures: 5,
        failureRate: 0.3,
        minRuns: 5,
        windowMs: 10_000,
      }).trip
    ).toBe(false);
  });

  test("trips global when a new capability joins an existing trip", () => {
    const result = evaluateBlastRadius(
      [event("one", "cap-b"), event("two", "cap-b"), event("three", "cap-b")],
      10_000,
      { ...limits, failures: 3 },
      ["cap-a"]
    );
    expect(result).toMatchObject({
      trip: true,
      scope: "global",
      capabilityIds: ["cap-a", "cap-b"],
    });
  });

  test("counts verification and rollback failures once", () => {
    const result = evaluateBlastRadius(
      [
        event("one", "cap-a", { failed: true }),
        event("one", "cap-a", { failed: false }),
        event("two", "cap-a", { failed: true }),
      ],
      10_000,
      { ...limits, failures: 2, failureRate: 1 }
    );
    expect(result.trip).toBe(true);
  });
});

describe("blast-radius persistence and hourly limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("disabled recording does not query or write", async () => {
    const admin = queryAdmin();
    await expect(
      recordBlastRadiusOutcome(
        admin as never,
        {
          run: {
            id: "run-1",
            organization_id: "org-1",
            ticket_id: "ticket-1",
          } as never,
          capabilityId: "cap-a",
        },
        { enabled: false }
      )
    ).resolves.toBeNull();
    expect(admin.from).not.toHaveBeenCalled();
    expect(mocks.setKillSwitch).not.toHaveBeenCalled();
  });

  test("records a failed execution query without storing the error", async () => {
    const admin = queryAdmin(
      [],
      {},
      {
        queryErrors: { capability_executions: { message: "private db error" } },
      }
    );
    const result = await recordBlastRadiusOutcome(
      admin as never,
      {
        run: {
          id: "run-1",
          organization_id: "org-1",
          ticket_id: "ticket-1",
        } as never,
        capabilityId: "cap-a",
      },
      { enabled: true }
    );

    expect(result).toBeNull();
    const events = admin.inserts.get("resolution_events") ?? [];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      organization_id: "org-1",
      run_id: "run-1",
      ticket_id: "ticket-1",
      kind: "blast_radius.check_failed",
      actor: "orchestrator",
      initiated_by: "ai",
      detail: { step: "load_executions" },
    });
    expect(events[0]?.detail).toEqual({ step: "load_executions" });
    expect(JSON.stringify(events)).not.toContain("private db error");
  });

  test("records the active stage when a query throws", async () => {
    const admin = queryAdmin(
      [],
      {},
      { throwOnQueryTable: "capability_executions" }
    );
    const result = await recordBlastRadiusOutcome(
      admin as never,
      {
        run: {
          id: "run-1",
          organization_id: "org-1",
          ticket_id: "ticket-1",
        } as never,
        capabilityId: "cap-a",
      },
      { enabled: true }
    );

    expect(result).toBeNull();
    expect(admin.inserts.get("resolution_events")).toMatchObject([
      { detail: { step: "load_executions" } },
    ]);
    expect(
      JSON.stringify(admin.inserts.get("resolution_events"))
    ).not.toContain("private query failure");
  });

  test("does not throw when recording a failed check also fails", async () => {
    const admin = queryAdmin(
      [],
      {},
      {
        queryErrors: { capability_executions: { message: "private db error" } },
        auditInsertError: true,
      }
    );

    await expect(
      recordBlastRadiusOutcome(
        admin as never,
        {
          run: {
            id: "run-1",
            organization_id: "org-1",
            ticket_id: "ticket-1",
          } as never,
          capabilityId: "cap-a",
        },
        { enabled: true }
      )
    ).resolves.toBeNull();
  });

  test("records a failed capability-switch update", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    mocks.setKillSwitch.mockResolvedValue({ ok: false });
    const admin = queryAdmin([
      {
        id: "execution-1",
        organization_id: "org-1",
        run_id: "run-1",
        capability_id: "cap-a",
        status: "failed",
        created_at: now.toISOString(),
      },
    ]);

    const result = await recordBlastRadiusOutcome(
      admin as never,
      {
        run: {
          id: "run-1",
          organization_id: "org-1",
          ticket_id: "ticket-1",
        } as never,
        capabilityId: "cap-a",
      },
      {
        enabled: true,
        now,
        limits: {
          failures: 1,
          failureRate: 1,
          minRuns: 1,
          windowMs: 300_000,
        },
      }
    );

    expect(result).toBeNull();
    expect(admin.inserts.get("resolution_events")).toMatchObject([
      { detail: { step: "set_capability_switch" } },
    ]);
  });

  test("trips a switch, records an event, and alerts affected organizations", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const rows = Array.from({ length: 5 }, (_, index) => ({
      id: `execution-${index}`,
      organization_id: "org-1",
      run_id: "run-1",
      capability_id: "cap-a",
      status: "failed",
      created_at: new Date(now.getTime() - index * 60_000).toISOString(),
    }));
    const admin = queryAdmin(rows);
    mocks.setKillSwitch.mockResolvedValue({ ok: true });
    await expect(
      recordBlastRadiusOutcome(
        admin as never,
        {
          run: {
            id: "run-1",
            organization_id: "org-1",
            ticket_id: "ticket-1",
          } as never,
          capabilityId: "cap-a",
        },
        {
          enabled: true,
          now,
          limits: {
            failures: 5,
            failureRate: 1,
            minRuns: 5,
            windowMs: 300_000,
          },
        }
      )
    ).resolves.toMatchObject({ trip: true, scope: "capability" });
    expect(mocks.setKillSwitch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        scope: "capability",
        scopeId: "cap-a",
        enabled: true,
        setBy: "system",
        reason: expect.stringMatching(/^blast_radius:/),
      })
    );
    expect(admin.inserts.get("resolution_events")).toEqual([
      expect.objectContaining({
        kind: "blast_radius.tripped",
        actor: "orchestrator",
        initiated_by: "ai",
      }),
    ]);
    expect(mocks.alertSecurityEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: "org-1",
        kind: "blast_radius_tripped",
      })
    );
  });

  test("alerts each affected organization using its newest failed run", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const rows = Array.from({ length: 6 }, (_, index) => ({
      id: `execution-${index}`,
      organization_id: `org-${(index % 3) + 1}`,
      run_id: `run-${(index % 3) + 1}`,
      capability_id: "cap-a",
      status: "failed",
      created_at: new Date(now.getTime() - index * 60_000).toISOString(),
    }));
    const admin = queryAdmin(rows, {
      resolution_runs: [
        { id: "run-2", organization_id: "org-2", ticket_id: "ticket-2" },
        { id: "run-3", organization_id: "org-3", ticket_id: "ticket-3" },
      ],
    });
    await recordBlastRadiusOutcome(
      admin as never,
      {
        run: {
          id: "run-1",
          organization_id: "org-1",
          ticket_id: "ticket-1",
        } as never,
        capabilityId: "cap-a",
      },
      {
        enabled: true,
        now,
        limits: {
          failures: 5,
          failureRate: 1,
          minRuns: 5,
          windowMs: 300_000,
        },
      }
    );
    expect(mocks.alertSecurityEvent).toHaveBeenCalledTimes(3);
    expect(mocks.alertSecurityEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: "org-2",
        runId: "run-2",
        ticketId: "ticket-2",
        detail: expect.objectContaining({
          scope: "capability",
          reason: expect.stringMatching(/^capability:/),
        }),
      })
    );
    expect(mocks.alertSecurityEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: "org-3",
        runId: "run-3",
        ticketId: "ticket-3",
      })
    );
  });

  test("counts failed verification and rollback records once per execution", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const rows = Array.from({ length: 5 }, (_, index) => ({
      id: `execution-${index}`,
      organization_id: "org-1",
      run_id: "run-1",
      capability_id: "cap-a",
      status: "succeeded",
      created_at: new Date(now.getTime() - index * 1000).toISOString(),
    }));
    const admin = queryAdmin(rows, {
      verification_results: [
        { execution_id: "execution-0", outcome: "failed" },
        { execution_id: "execution-0", outcome: "failed" },
      ],
      rollback_runs: [{ execution_id: "execution-1" }],
    });
    const result = await recordBlastRadiusOutcome(
      admin as never,
      {
        run: {
          id: "run-1",
          organization_id: "org-1",
          ticket_id: "ticket-1",
        } as never,
        capabilityId: "cap-a",
      },
      {
        enabled: true,
        now,
        limits: {
          failures: 99,
          failureRate: 0.4,
          minRuns: 5,
          windowMs: 300_000,
        },
      }
    );
    expect(result).toMatchObject({ trip: true, scope: "capability" });
  });

  test("ignores a recent failed reservation with no duration", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const runtimeMs = getAutonomyLimits().runtimeMs;
    const admin = queryAdmin([
      {
        id: "in-flight",
        organization_id: "org-1",
        run_id: "run-1",
        capability_id: "cap-a",
        status: "failed",
        duration_ms: null,
        created_at: new Date(now.getTime() - runtimeMs + 1).toISOString(),
      },
    ]);
    const result = await recordBlastRadiusOutcome(
      admin as never,
      {
        run: {
          id: "run-1",
          organization_id: "org-1",
          ticket_id: "ticket-1",
        } as never,
        capabilityId: "cap-a",
      },
      {
        enabled: true,
        now,
        limits: {
          failures: 1,
          failureRate: 1,
          minRuns: 1,
          windowMs: runtimeMs + 10_000,
        },
      }
    );
    expect(result).toMatchObject({ trip: false });
    expect(mocks.setKillSwitch).not.toHaveBeenCalled();
  });

  test("counts an old failed reservation with no duration as a crash", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const runtimeMs = getAutonomyLimits().runtimeMs;
    const admin = queryAdmin([
      {
        id: "crashed",
        organization_id: "org-1",
        run_id: "run-1",
        capability_id: "cap-a",
        status: "failed",
        duration_ms: null,
        created_at: new Date(now.getTime() - runtimeMs - 1).toISOString(),
      },
    ]);
    mocks.setKillSwitch.mockResolvedValue({ ok: true });
    const result = await recordBlastRadiusOutcome(
      admin as never,
      {
        run: {
          id: "run-1",
          organization_id: "org-1",
          ticket_id: "ticket-1",
        } as never,
        capabilityId: "cap-a",
      },
      {
        enabled: true,
        now,
        limits: {
          failures: 1,
          failureRate: 1,
          minRuns: 1,
          windowMs: runtimeMs + 10_000,
        },
      }
    );
    expect(result).toMatchObject({ trip: true, scope: "capability" });
    expect(mocks.setKillSwitch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ scope: "capability", scopeId: "cap-a" })
    );
  });

  test("does not repeat work for an already-active automatic switch", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const rows = Array.from({ length: 5 }, (_, index) => ({
      id: `execution-${index}`,
      organization_id: "org-1",
      run_id: "run-1",
      capability_id: "cap-a",
      status: "failed",
      created_at: now.toISOString(),
    }));
    const admin = queryAdmin(rows, {
      ai_kill_switches: [
        {
          scope: "capability",
          scope_id: "cap-a",
          enabled: true,
          reason: "blast_radius:failures",
          set_at: now.toISOString(),
        },
      ],
    });
    const result = await recordBlastRadiusOutcome(
      admin as never,
      {
        run: {
          id: "run-1",
          organization_id: "org-1",
          ticket_id: "ticket-1",
        } as never,
        capabilityId: "cap-a",
      },
      { enabled: true, now }
    );
    expect(result).toMatchObject({ trip: true });
    expect(mocks.setKillSwitch).not.toHaveBeenCalled();
    expect(mocks.alertSecurityEvent).not.toHaveBeenCalled();
    expect(admin.inserts.get("resolution_events")).toBeUndefined();
  });

  test("excludes pre-clear events from the new evaluation window", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const clearedAt = new Date(now.getTime() - 5 * 60_000);
    const rows = Array.from({ length: 5 }, (_, index) => ({
      id: `execution-${index}`,
      organization_id: "org-1",
      run_id: "run-1",
      capability_id: "cap-a",
      status: "failed",
      created_at: new Date(clearedAt.getTime() - 1000 - index).toISOString(),
    }));
    const admin = queryAdmin(rows, {
      ai_kill_switches: [
        {
          scope: "capability",
          scope_id: "cap-a",
          enabled: false,
          reason: "blast_radius_cleared",
          set_at: clearedAt.toISOString(),
        },
      ],
    });
    const result = await recordBlastRadiusOutcome(
      admin as never,
      {
        run: {
          id: "run-1",
          organization_id: "org-1",
          ticket_id: "ticket-1",
        } as never,
        capabilityId: "cap-a",
      },
      { enabled: true, now }
    );
    expect(result).toMatchObject({ trip: false });
    expect(mocks.setKillSwitch).not.toHaveBeenCalled();
  });

  test("fails closed on hourly query errors and ignores null limits", async () => {
    const failingAdmin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: async () => ({
              data: null,
              error: { message: "query failed" },
            }),
          }),
        }),
      }),
    };
    await expect(
      checkHourlyLimits(
        failingAdmin as never,
        {
          organizationId: "org-1",
          capabilityId: "safe",
          capabilityVersion: 1,
        },
        { orgHourly: 2, capabilityDevicesPerHour: null }
      )
    ).resolves.toEqual({
      ok: false,
      code: "blast_radius_limit",
      scope: "organization",
    });
    await expect(
      checkHourlyLimits(
        failingAdmin as never,
        {
          organizationId: "org-1",
          capabilityId: "safe",
          capabilityVersion: 1,
        },
        { orgHourly: null, capabilityDevicesPerHour: null }
      )
    ).resolves.toEqual({ ok: true });
  });

  test("enforces organization hourly execution limits", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const admin = queryAdmin([
      { organization_id: "org-1", created_at: now.toISOString() },
      { organization_id: "org-1", created_at: now.toISOString() },
    ]);
    await expect(
      checkHourlyLimits(
        admin as never,
        {
          organizationId: "org-1",
          capabilityId: "safe",
          capabilityVersion: 1,
        },
        { orgHourly: 2, capabilityDevicesPerHour: null },
        now
      )
    ).resolves.toMatchObject({
      ok: false,
      code: "blast_radius_limit",
      scope: "organization",
    });
  });

  test("limits distinct execute-mode devices for the target action", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const jobs = [
      {
        action_id: "device_flush_dns",
        kind: "action",
        mode: "execute",
        device_id: "device-a",
        created_at: now.toISOString(),
      },
      {
        action_id: "device_flush_dns",
        kind: "action",
        mode: "execute",
        device_id: "device-a",
        created_at: now.toISOString(),
      },
      {
        action_id: "device_flush_dns",
        kind: "action",
        mode: "execute",
        device_id: "device-b",
        created_at: now.toISOString(),
      },
      {
        action_id: "device_reboot",
        kind: "action",
        mode: "execute",
        device_id: "device-c",
        created_at: now.toISOString(),
      },
      {
        action_id: "device_flush_dns",
        kind: "action",
        mode: "preview",
        device_id: "device-d",
        created_at: now.toISOString(),
      },
    ];
    const admin = queryAdmin([], { device_jobs: jobs });
    await expect(
      checkHourlyLimits(
        admin as never,
        {
          organizationId: "org-1",
          capabilityId: "device_flush_dns",
          capabilityVersion: 1,
        },
        { orgHourly: null, capabilityDevicesPerHour: 2 },
        now
      )
    ).resolves.toMatchObject({
      ok: false,
      code: "blast_radius_limit",
      scope: "capability_devices",
    });

    const oneDeviceAdmin = queryAdmin([], {
      device_jobs: jobs.slice(0, 2),
    });
    await expect(
      checkHourlyLimits(
        oneDeviceAdmin as never,
        {
          organizationId: "org-1",
          capabilityId: "device_flush_dns",
          capabilityVersion: 1,
        },
        { orgHourly: null, capabilityDevicesPerHour: 2 },
        now
      )
    ).resolves.toEqual({ ok: true });
  });
});
