import type { BenchmarkCase } from "./benchmark/types";
import type { HandlerAdmin } from "../executor/handlers/types";
import { listCapabilities } from "../capabilities/registry";
import { FakeDirectory } from "../connectors/fake";

type Row = Record<string, unknown>;

type QueryResult = {
  data: Row | Row[] | null;
  error: { message: string; code?: string } | null;
};

type FakeAdmin = HandlerAdmin & {
  rows: Map<string, Row[]>;
  executionInserts: number;
  allowedEvents: number;
  seedReplay: (idempotencyKey: string) => void;
  seedConsent: (parameterHash: string) => void;
  seedFailedExecution: (
    parameters: Record<string, unknown>,
    capabilityId: string,
    capabilityVersion: number
  ) => void;
};

function makeQuery(admin: FakeAdmin, table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let operation: "select" | "insert" | "update" | "upsert" = "select";
  let payload: Row | Row[] | null = null;
  let limit: number | null = null;
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return query;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return query;
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return query;
    },
    gte: (column: string, value: unknown) => {
      filters.push(
        (row) =>
          typeof row[column] === "string" &&
          typeof value === "string" &&
          row[column] >= value
      );
      return query;
    },
    like: () => query,
    or: (expression: string) => {
      const alternatives =
        expression.match(/and\([^)]*\)|scope\.eq\.[^,]+/g) ?? [];
      filters.push((row) =>
        alternatives.some((part) => {
          const scopeMatch = part.match(/scope\.eq\.([^,)]*)/);
          if (!scopeMatch) return false;
          const scopeIdMatch = part.match(/scope_id\.eq\.([^,)]+)/);
          return (
            row.scope === scopeMatch[1] &&
            (!scopeIdMatch || row.scope_id === scopeIdMatch[1])
          );
        })
      );
      return query;
    },
    order: () => query,
    limit: (value: number) => {
      limit = value;
      return query;
    },
    insert: (value: Row | Row[]) => {
      operation = "insert";
      payload = value;
      return query;
    },
    upsert: (value: Row | Row[]) => {
      operation = "upsert";
      payload = value;
      return query;
    },
    update: (value: Row) => {
      operation = "update";
      payload = value;
      return query;
    },
    maybeSingle: async () => execute(true),
    single: async () => execute(true),
    then: (
      resolve: (result: QueryResult) => unknown,
      reject?: (error: unknown) => unknown
    ) => Promise.resolve(execute(false)).then(resolve, reject),
  };

  function selectedRows(): Row[] {
    const rows = admin.rows.get(table) ?? [];
    const selected = rows.filter((row) =>
      filters.every((filter) => filter(row))
    );
    return limit === null ? selected : selected.slice(0, limit);
  }

  function execute(single: boolean): QueryResult {
    const rows = admin.rows.get(table) ?? [];
    if (operation === "insert" || operation === "upsert") {
      const values = Array.isArray(payload) ? payload : [payload ?? {}];
      for (const value of values) {
        if (
          table === "capability_executions" &&
          typeof value.idempotency_key === "string" &&
          rows.some((row) => row.idempotency_key === value.idempotency_key)
        ) {
          return {
            data: null,
            error: {
              message: "duplicate capability execution idempotency key",
              code: "23505",
            },
          };
        }
        if (table === "capability_executions") admin.executionInserts += 1;
        if (
          table === "resolution_events" &&
          value.kind === "guardrail.execution_allowed" &&
          value.detail &&
          typeof value.detail === "object" &&
          (value.detail as Row).reasonCode === "allowed"
        ) {
          admin.allowedEvents += 1;
        }
        rows.push({ ...value, id: value.id ?? `${table}-${rows.length + 1}` });
      }
      admin.rows.set(table, rows);
      return {
        data: single ? (rows[rows.length - 1] ?? null) : values,
        error: null,
      };
    }
    if (operation === "update") {
      const selected = selectedRows();
      for (const row of selected) Object.assign(row, payload ?? {});
      return { data: single ? (selected[0] ?? null) : selected, error: null };
    }
    const selected = selectedRows();
    return { data: single ? (selected[0] ?? null) : selected, error: null };
  }

  return query;
}

type Seed = {
  organizationId: string;
  ticketId: string;
  runId: string;
  stepId: string;
  rows: Map<string, Row[]>;
};

export type BenchmarkHarness = Seed & {
  handlerCalls: number;
  executionInserts: number;
  allowedEvents: number;
  killSwitch: BenchmarkCase["killSwitch"] | null;
  replay: boolean;
  admin: FakeAdmin;
  invokeHandler: () => never;
  seedReplay: (idempotencyKey: string) => void;
  seedConsent: (parameterHash: string) => void;
  seedFailedExecution: (
    parameters: Record<string, unknown>,
    capabilityId: string,
    capabilityVersion: number
  ) => void;
  identityBound: boolean;
  identityCapability: boolean;
  directory: FakeDirectory | null;
};

export function createBenchmarkHarness(
  benchmarkCase: BenchmarkCase
): BenchmarkHarness {
  const organizationId =
    benchmarkCase.pilot === "org_removed"
      ? "00000000-0000-4000-8000-000000000099"
      : "00000000-0000-4000-8000-000000000001";
  const ticketId = "00000000-0000-4000-8000-000000000002";
  const runId = "00000000-0000-4000-8000-000000000003";
  const stepId = "00000000-0000-4000-8000-000000000004";
  const identityBound = benchmarkCase.identity?.bound === true;
  const directory = benchmarkCase.identity?.directory
    ? new FakeDirectory({
        directoryUserId: benchmarkCase.identity.directory.directoryUserId,
        primaryEmail: benchmarkCase.identity.directory.primaryEmail,
        enabled: benchmarkCase.identity.directory.enabled ?? true,
        suspended: benchmarkCase.identity.directory.suspended ?? false,
        passwordExpired: false,
        lastSignInAt: null,
        recentSignInErrors: [],
        mfaRegistered: true,
        groups: [...(benchmarkCase.identity.directory.groups ?? [])],
      })
    : null;
  const capabilities = listCapabilities();
  const capabilityRows =
    benchmarkCase.pilot === "capability_removed"
      ? capabilities
          .filter((capability) => capability.id !== "search_approved_knowledge")
          .map((capability) => ({
            organization_id: organizationId,
            capability_id: capability.id,
            min_version: capability.version,
            enabled: true,
          }))
      : capabilities.map((capability) => ({
          organization_id: organizationId,
          capability_id: capability.id,
          min_version: capability.version,
          enabled: true,
        }));
  const rows = new Map<string, Row[]>([
    [
      "tickets",
      [
        {
          id: ticketId,
          organization_id:
            benchmarkCase.tenant === "foreign_ticket"
              ? "00000000-0000-4000-8000-000000000099"
              : organizationId,
          user_id: "requester-1",
        },
      ],
    ],
    [
      "resolution_runs",
      [
        {
          id: runId,
          organization_id: organizationId,
          ticket_id: ticketId,
          status: benchmarkCase.priorAttempts?.length ? "failed" : "executing",
          attempts: 0,
          max_attempts: 3,
          cost_cents: 0,
          budget_cents: 50,
          deadline_at: new Date(Date.now() + 60_000).toISOString(),
        },
        ...(benchmarkCase.limit === "repeated_failure"
          ? [
              {
                id: runId,
                organization_id: organizationId,
                ticket_id: ticketId,
                status: "failed",
              },
            ]
          : []),
      ],
    ],
    [
      "resolution_steps",
      [
        {
          id: stepId,
          organization_id: organizationId,
          run_id: runId,
          kind: "plan",
          detail: { plannerProvider: "deterministic" },
          position: 1,
        },
      ],
    ],
    ["organization_capabilities", capabilityRows],
    [
      "capability_versions",
      capabilities.map((capability) => ({
        capability_id: capability.id,
        version: capability.version,
        status: "active",
      })),
    ],
    [
      "ai_kill_switches",
      benchmarkCase.killSwitch
        ? [
            {
              organization_id:
                benchmarkCase.killSwitch === "organization"
                  ? organizationId
                  : null,
              scope: benchmarkCase.killSwitch,
              scope_id:
                benchmarkCase.killSwitch === "organization"
                  ? organizationId
                  : benchmarkCase.killSwitch === "capability"
                    ? "search_approved_knowledge"
                    : benchmarkCase.killSwitch === "provider"
                      ? "deterministic"
                      : null,
              enabled: true,
              reason: `${benchmarkCase.killSwitch} benchmark switch`,
            },
          ]
        : [],
    ],
    [
      "capability_breakers",
      benchmarkCase.killSwitch === "breaker"
        ? [
            {
              organization_id: organizationId,
              capability_id: "search_approved_knowledge",
              state: "open",
              failures: 3,
              cooldown_until: new Date(Date.now() + 60_000).toISOString(),
            },
          ]
        : [],
    ],
    [
      "capability_executions",
      benchmarkCase.priorAttempts?.length ||
      benchmarkCase.limit === "repeated_failure"
        ? [
            {
              organization_id: organizationId,
              run_id: runId,
              capability_id: benchmarkCase.priorAttempts?.[0]?.capabilityId,
              capability_version: benchmarkCase.priorAttempts?.[0]?.version,
              parameters: {},
              status: "failed",
            },
          ]
        : [],
    ],
    ["resolution_events", []],
    [
      "identity_bindings",
      identityBound
        ? [
            {
              run_id: runId,
              ticket_id: ticketId,
              organization_id: organizationId,
              user_id: "requester-1",
              provider: "google",
              directory_user_id:
                benchmarkCase.identity?.directory?.directoryUserId ??
                "directory-user-1",
              matched_email_hash: "unverified-benchmark-binding-hash",
              bound_at: new Date().toISOString(),
            },
          ]
        : [],
    ],
    ["verification_results", []],
    ["rollback_runs", []],
  ]);
  const admin = {
    rows,
    executionInserts: 0,
    allowedEvents: 0,
    from: (table: string) => makeQuery(admin, table),
    seedReplay: (idempotencyKey: string) => {
      const executions = rows.get("capability_executions") ?? [];
      executions.push({
        id: "replay-execution",
        organization_id: organizationId,
        idempotency_key: idempotencyKey,
        status: "succeeded",
      });
      rows.set("capability_executions", executions);
    },
    seedConsent: (parameterHash: string) => {
      const approvals = rows.get("approval_requests") ?? [];
      if (!benchmarkCase.consent || benchmarkCase.consent === "wrong_org") {
        return;
      }
      approvals.push({
        id: "approval-1",
        organization_id: organizationId,
        run_id: runId,
        step_id: stepId,
        ticket_id:
          benchmarkCase.consent === "wrong_ticket"
            ? "00000000-0000-4000-8000-000000000099"
            : ticketId,
        type: "user_consent",
        status: "granted",
        expires_at:
          benchmarkCase.consent === "expired"
            ? new Date(Date.now() - 60_000).toISOString()
            : new Date(Date.now() + 60_000).toISOString(),
        capability_id: "retry_failed_notification",
        capability_version: 1,
        parameter_hash:
          benchmarkCase.consent === "hash_mismatch"
            ? "different-hash"
            : parameterHash,
        risk_level: "caution",
        consumed_at:
          benchmarkCase.consent === "replay" ? new Date().toISOString() : null,
        decided_by_user_id:
          benchmarkCase.consent === "wrong_user" ? "other-user" : "requester-1",
        created_at: new Date().toISOString(),
      });
      rows.set("approval_requests", approvals);
    },
    seedFailedExecution: (
      parameters: Record<string, unknown>,
      capabilityId: string,
      capabilityVersion: number
    ) => {
      const executions = rows.get("capability_executions") ?? [];
      executions.push({
        id: "failed-execution",
        organization_id: organizationId,
        run_id: runId,
        capability_id: capabilityId,
        capability_version: capabilityVersion,
        parameters,
        status: "failed",
      });
      rows.set("capability_executions", executions);
    },
  } as unknown as FakeAdmin;
  return {
    organizationId,
    ticketId,
    runId,
    stepId,
    rows,
    handlerCalls: 0,
    executionInserts: 0,
    allowedEvents: 0,
    killSwitch: benchmarkCase.killSwitch ?? null,
    replay: benchmarkCase.replay === true,
    admin,
    invokeHandler: () => {
      throw new Error("Benchmark capability handler must never be invoked.");
    },
    seedReplay: admin.seedReplay,
    seedConsent: admin.seedConsent,
    seedFailedExecution: admin.seedFailedExecution,
    identityBound,
    identityCapability: false,
    directory,
  };
}
