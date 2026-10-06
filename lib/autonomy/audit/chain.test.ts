import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  AUDIT_CHAIN_COLUMNS,
  computeRowHash,
  verifyChain,
  type AuditChainRow,
} from "./chain";

const orgId = "00000000-0000-4000-8000-000000000001";

function row(chainSeq: number, previous: AuditChainRow | null): AuditChainRow {
  const payload = {
    id: `row-${chainSeq}`,
    organization_id: orgId,
    chain_seq: chainSeq,
  };
  return {
    id: payload.id,
    chain_seq: chainSeq,
    prev_hash: previous?.row_hash ?? null,
    row_hash: computeRowHash(previous?.row_hash ?? null, payload),
    created_at: "2026-10-06T00:00:00.000000Z",
    payload,
  };
}

function adminFor(rows: AuditChainRow[]) {
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
    data: rows.filter((item) => item.chain_seq > Number(args.p_after_seq ?? 0)),
    error: null,
  }));
  return { admin: { rpc } as never, rpc };
}

describe("tamper-evident audit chain", () => {
  test("exports the fixed hashed columns present in the SQL migration", async () => {
    const sql = await readFile(
      join(process.cwd(), "supabase/audit-chain.sql"),
      "utf8"
    );
    for (const [table, columns] of Object.entries(AUDIT_CHAIN_COLUMNS)) {
      const section = sql.match(
        new RegExp(
          `when '${table}' then\\s+columns := array\\[([\\s\\S]*?)\\];`
        )
      );
      expect(section, table).not.toBeNull();
      expect(
        [...(section?.[1].matchAll(/'([a-z_]+)'/g) ?? [])].map(
          (match) => match[1]
        ),
        table
      ).toEqual(columns);
    }
  });

  test("verifies an intact chain and accepts the first predecessor after since", async () => {
    const first = row(1, null);
    const second = row(2, first);
    const third = row(3, second);
    const full = adminFor([first, second, third]);
    await expect(
      verifyChain(full.admin, orgId, "agent_steps")
    ).resolves.toEqual({ ok: true, checked: 3 });
    const partial = adminFor([third]);
    await expect(
      verifyChain(partial.admin, orgId, "agent_steps", {
        since: "2026-10-05T00:00:00.000Z",
      })
    ).resolves.toEqual({ ok: true, checked: 1 });
  });

  test("verifies paginated RPC rows and normalizes bigint sequence strings", async () => {
    const allRows: AuditChainRow[] = [];
    let previous: AuditChainRow | null = null;
    for (let chainSeq = 1; chainSeq <= 501; chainSeq += 1) {
      const item = row(chainSeq, previous);
      allRows.push({
        ...item,
        chain_seq: String(chainSeq) as unknown as number,
      });
      previous = item;
    }
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      const afterSeq = Number(args.p_after_seq ?? 0);
      return {
        data: allRows
          .filter((item) => Number(item.chain_seq) > afterSeq)
          .slice(0, Number(args.p_limit)),
        error: null,
      };
    });
    await expect(
      verifyChain({ rpc } as never, orgId, "resolution_events")
    ).resolves.toEqual({ ok: true, checked: 501 });
    expect(rpc.mock.calls.map(([, args]) => args.p_after_seq)).toEqual([
      0, 500,
    ]);
  });

  test("reports the row after a deleted middle row as the first break", async () => {
    const first = row(1, null);
    const second = row(2, first);
    const fourth = row(4, row(3, second));
    const { admin } = adminFor([first, second, fourth]);
    await expect(
      verifyChain(admin, orgId, "resolution_events")
    ).resolves.toMatchObject({
      ok: false,
      checked: 3,
      firstBreak: { id: "row-4", reason: "seq_gap" },
    });
  });

  test("detects a tampered payload hash", async () => {
    const first = row(1, null);
    const tampered = {
      ...first,
      payload: { ...(first.payload as object), kind: "edited" },
    };
    const { admin } = adminFor([tampered]);
    await expect(
      verifyChain(admin, orgId, "agent_steps")
    ).resolves.toMatchObject({
      ok: false,
      firstBreak: { id: first.id, reason: "hash_mismatch" },
    });
  });
});
