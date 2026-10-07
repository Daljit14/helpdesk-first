// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest";
import { computeRowHash } from "@/lib/autonomy/audit/chain";
import { verifyExport } from "@/lib/autonomy/audit/export";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  createAdminClient: vi.fn(),
  getExcludedRecordIds: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({
  getAdminSession: mocks.getAdminSession,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/admin/record-exclusions", () => ({
  getExcludedRecordIds: mocks.getExcludedRecordIds,
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  createRateLimiter: () => ({ check: mocks.checkRateLimit }),
}));

import { exportAuditChain } from "./admin-audit-chain";

const session = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "org_admin" as const,
  organizationId: "00000000-0000-4000-8000-000000000001",
  displayName: "Admin",
  isPlatformAdmin: false,
};
const excludedRun = "00000000-0000-4000-8000-000000000011";
const excludedTicket = "00000000-0000-4000-8000-000000000012";

function row(
  id: string,
  chainSeq: number,
  previousHash: string | null,
  payload: Record<string, unknown>
) {
  return {
    id,
    chain_seq: chainSeq,
    prev_hash: previousHash,
    row_hash: computeRowHash(previousHash, payload),
    created_at:
      typeof payload.created_at === "string"
        ? payload.created_at
        : "2026-10-06T12:00:00.000000Z",
    payload,
  };
}

function sessionQuery(data: unknown[]) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminSession.mockResolvedValue(session);
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.getExcludedRecordIds.mockImplementation(
    async (_admin, _organization, table) =>
      new Set(
        table === "resolution_runs"
          ? [excludedRun]
          : table === "tickets"
            ? [excludedTicket]
            : []
      )
  );
});

describe("exportAuditChain", () => {
  test("requires organization-admin access before creating an admin client", async () => {
    mocks.getAdminSession.mockResolvedValue({
      ...session,
      role: "support_agent",
    });
    await expect(
      exportAuditChain({ from: "2026-10-06", to: "2026-10-06" })
    ).resolves.toEqual({
      ok: false,
      error: "Organization admin access required.",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  test("rate limits exports before creating or querying the admin client", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false });

    await expect(
      exportAuditChain({ from: "2026-10-06", to: "2026-10-06" })
    ).resolves.toEqual({
      ok: false,
      error: "Too many audit exports. Try again in a minute.",
    });

    expect(mocks.checkRateLimit).toHaveBeenCalledWith(session.userId);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.getExcludedRecordIds).not.toHaveBeenCalled();
  });

  test("scopes rows to the session org and emits excluded records without payloads", async () => {
    const resolutionPayload1 = {
      id: "resolution-1",
      organization_id: session.organizationId,
      run_id: excludedRun,
      ticket_id: null,
      created_at: "2026-10-06T12:00:00.000000Z",
      chain_seq: 1,
    };
    const resolutionRow1 = row("resolution-1", 1, null, resolutionPayload1);
    const resolutionPayload2 = {
      id: "resolution-2",
      organization_id: session.organizationId,
      run_id: null,
      ticket_id: null,
      created_at: "2026-10-06T12:00:01.000000Z",
      chain_seq: 2,
    };
    const resolutionRow2 = row(
      "resolution-2",
      2,
      resolutionRow1.row_hash,
      resolutionPayload2
    );
    const resolutionRow3 = row("resolution-3", 3, resolutionRow2.row_hash, {
      id: "resolution-3",
      organization_id: session.organizationId,
      run_id: null,
      ticket_id: null,
      created_at: "2026-10-07T00:00:00.000000Z",
      chain_seq: 3,
    });
    const stepPayload1 = {
      id: "step-1",
      organization_id: session.organizationId,
      session_id: "session-1",
      created_at: "2026-10-06T12:01:00.000000Z",
      chain_seq: 1,
      result_summary: "private excluded summary",
    };
    const stepRow1 = row("step-1", 1, null, stepPayload1);
    const stepPayload2 = {
      id: "step-2",
      organization_id: session.organizationId,
      session_id: "session-2",
      created_at: "2026-10-06T12:01:01.000000Z",
      chain_seq: 2,
      result_summary: "another private excluded summary",
    };
    const stepRow2 = row("step-2", 2, stepRow1.row_hash, stepPayload2);
    const stepPayload3 = {
      id: "step-3",
      organization_id: session.organizationId,
      session_id: "session-3",
      created_at: "2026-10-06T12:01:02.000000Z",
      chain_seq: 3,
    };
    const stepRow3 = row("step-3", 3, stepRow2.row_hash, stepPayload3);
    const records = {
      resolution_events: [resolutionRow1, resolutionRow2, resolutionRow3],
      agent_steps: [stepRow1, stepRow2, stepRow3],
      capability_autonomy_transitions: [],
      org_action_policy_events: [],
    };
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: records[args.p_table as keyof typeof records]
        .filter(
          (item) =>
            item.chain_seq > Number(args.p_after_seq) &&
            (args.p_since === null ||
              new Date(item.created_at).getTime() >=
                new Date(String(args.p_since)).getTime())
        )
        .slice(0, Number(args.p_limit)),
      error: null,
    }));
    const sessions = sessionQuery([
      {
        id: "session-1",
        backing_ticket_id: excludedTicket,
        resolution_run_id: null,
      },
      {
        id: "session-2",
        backing_ticket_id: null,
        resolution_run_id: excludedRun,
      },
      {
        id: "session-3",
        backing_ticket_id: null,
        resolution_run_id: null,
      },
    ]);
    mocks.createAdminClient.mockReturnValue({
      rpc,
      from: vi.fn(() => sessions),
    });

    const result = await exportAuditChain({
      from: "2026-10-06",
      to: "2026-10-06",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lines = result.content.trim().split("\n");
    const parsed = lines.map((line) => JSON.parse(line));
    expect(parsed.filter((item) => item.type === "excluded")).toEqual([
      expect.objectContaining({
        table: "resolution_events",
        id: "resolution-1",
        chain_seq: 1,
      }),
      expect.objectContaining({
        table: "agent_steps",
        id: "step-1",
        chain_seq: 1,
      }),
      expect.objectContaining({
        table: "agent_steps",
        id: "step-2",
        chain_seq: 2,
      }),
    ]);
    expect(
      parsed
        .filter((item) => item.type === "excluded")
        .every((item) => !("payload" in item))
    ).toBe(true);
    expect(result.content).not.toContain("private excluded summary");
    expect(result.content).not.toContain("another private excluded summary");
    expect(result.content).not.toContain("resolution-3");
    expect(verifyExport(lines)).toEqual({ ok: true, checked: 5 });
    expect(
      rpc.mock.calls.every(
        ([, args]) => args.p_organization_id === session.organizationId
      )
    ).toBe(true);
    expect(sessions.eq).toHaveBeenCalledWith(
      "organization_id",
      session.organizationId
    );
  });

  test("exports a contiguous sequence when created_at falls outside both range edges", async () => {
    const timestamps = [
      "2026-10-06T12:00:00.000000Z",
      "2026-10-05T23:59:59.999999Z",
      "2026-10-07T00:00:00.000000Z",
      "2026-10-06T23:59:59.999999Z",
    ];
    let previousHash: string | null = null;
    const events = timestamps.map((createdAt, index) => {
      const id = `boundary-${index + 1}`;
      const payload = {
        id,
        organization_id: session.organizationId,
        run_id: null,
        ticket_id: null,
        created_at: createdAt,
        chain_seq: index + 1,
      };
      const result = row(id, index + 1, previousHash, payload);
      previousHash = result.row_hash;
      return result;
    });
    const records = {
      resolution_events: events,
      agent_steps: [],
      capability_autonomy_transitions: [],
      org_action_policy_events: [],
    };
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: records[args.p_table as keyof typeof records]
        .filter(
          (item) =>
            item.chain_seq > Number(args.p_after_seq) &&
            (args.p_since === null ||
              new Date(item.created_at).getTime() >=
                new Date(String(args.p_since)).getTime())
        )
        .slice(0, Number(args.p_limit)),
      error: null,
    }));
    mocks.createAdminClient.mockReturnValue({
      rpc,
      from: vi.fn(),
    });

    const result = await exportAuditChain({
      from: "2026-10-06",
      to: "2026-10-06",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lines = result.content.trim().split("\n");
    const parsed = lines.map((line) => JSON.parse(line));
    expect(
      parsed
        .filter(
          (item) => item.type === "row" && item.table === "resolution_events"
        )
        .map((item) => item.id)
    ).toEqual(["boundary-1", "boundary-2", "boundary-3", "boundary-4"]);
    expect(verifyExport(lines)).toEqual({ ok: true, checked: 4 });
  });

  test("returns a friendly message when the audit-chain RPC is unapplied", async () => {
    mocks.createAdminClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find the function public.audit_chain_rows",
        },
      })),
      from: vi.fn(),
    });
    await expect(
      exportAuditChain({ from: "2026-10-06", to: "2026-10-06" })
    ).resolves.toEqual({
      ok: false,
      error: "Audit chain SQL not applied yet.",
    });
  });
});
