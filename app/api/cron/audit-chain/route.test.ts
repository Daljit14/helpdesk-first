import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alertSecurityEvent: vi.fn(),
  createAdminClient: vi.fn(),
  isAuditChainCheckEnabled: vi.fn(),
  verifyChain: vi.fn(),
}));

vi.mock("@/lib/autonomy/audit/chain", () => ({
  AUDIT_CHAIN_TABLES: [
    "resolution_events",
    "agent_steps",
    "capability_autonomy_transitions",
  ],
  verifyChain: mocks.verifyChain,
}));
vi.mock("@/lib/autonomy/alerts", () => ({
  alertSecurityEvent: mocks.alertSecurityEvent,
}));
vi.mock("@/lib/admin/flags", () => ({
  isAuditChainCheckEnabled: mocks.isAuditChainCheckEnabled,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { GET } from "./route";

const previousSecret = process.env.CRON_SECRET;
const previousFlag = process.env.HELP_DESK_AUDIT_CHAIN_CHECK_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAuditChainCheckEnabled.mockReturnValue(false);
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;
  if (previousFlag === undefined)
    delete process.env.HELP_DESK_AUDIT_CHAIN_CHECK_ENABLED;
  else process.env.HELP_DESK_AUDIT_CHAIN_CHECK_ENABLED = previousFlag;
});

describe("audit-chain cron authentication", () => {
  test("rejects missing or incorrect bearer secrets", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    const missing = await GET(
      new Request("https://example.test/api/cron/audit-chain")
    );
    const incorrect = await GET(
      new Request("https://example.test/api/cron/audit-chain", {
        headers: { authorization: "Bearer wrong-secret" },
      })
    );
    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
  });

  test("returns without database access while the default-off flag is disabled", async () => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.HELP_DESK_AUDIT_CHAIN_CHECK_ENABLED = "false";
    const response = await GET(
      new Request("https://example.test/api/cron/audit-chain", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ skipped: true });
  });

  test("alerts on a broken chain and still anchors the current head", async () => {
    const events: string[] = [];
    const anchorWrites: Array<{ table_name: string; chain_seq: number }> = [];
    mocks.isAuditChainCheckEnabled.mockReturnValue(true);
    mocks.verifyChain.mockResolvedValue({
      ok: false,
      checked: 4,
      firstBreak: {
        id: "after-gap",
        expected: "3",
        actual: "4",
        reason: "seq_gap",
      },
    });
    mocks.alertSecurityEvent.mockImplementation(async () => {
      events.push("alert");
    });
    mocks.createAdminClient.mockReturnValue({
      from(table: string) {
        const query = {
          select() {
            return query;
          },
          eq() {
            return query;
          },
          order() {
            return query;
          },
          range() {
            return Promise.resolve({
              data: [{ id: "organization-1" }],
              error: null,
            });
          },
          limit() {
            return query;
          },
          maybeSingle() {
            return Promise.resolve({
              data:
                table === "audit_chain_anchors"
                  ? null
                  : { chain_seq: 4, row_hash: "head-hash" },
              error: null,
            });
          },
          insert(value: { table_name: string; chain_seq: number }) {
            anchorWrites.push(value);
            events.push("anchor");
            return Promise.resolve({ error: null });
          },
        };
        return query;
      },
    });
    process.env.CRON_SECRET = "test-cron-secret";

    const response = await GET(
      new Request("https://example.test/api/cron/audit-chain", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const body = (await response.json()) as {
      results: Array<{ break: { id: string }; anchored: boolean }>;
    };

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(3);
    expect(
      body.results.every((result) => result.break.id === "after-gap")
    ).toBe(true);
    expect(body.results.every((result) => result.anchored)).toBe(true);
    expect(anchorWrites).toHaveLength(3);
    expect(events).toEqual([
      "alert",
      "anchor",
      "alert",
      "anchor",
      "alert",
      "anchor",
    ]);
  });
});
