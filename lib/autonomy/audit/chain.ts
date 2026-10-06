import { createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { canonical } from "../guardrails/hash";

export const AUDIT_CHAIN_TABLES = [
  "resolution_events",
  "agent_steps",
  "capability_autonomy_transitions",
] as const;

export type AuditChainTable = (typeof AUDIT_CHAIN_TABLES)[number];

export const AUDIT_CHAIN_COLUMNS: Readonly<
  Record<AuditChainTable, readonly string[]>
> = {
  resolution_events: [
    "id",
    "organization_id",
    "run_id",
    "ticket_id",
    "kind",
    "actor",
    "from_status",
    "to_status",
    "detail",
    "initiated_by",
    "versions",
    "created_at",
    "chain_seq",
  ],
  agent_steps: [
    "id",
    "session_id",
    "organization_id",
    "seq",
    "kind",
    "tool_name",
    "capability_id",
    "params_hash",
    "policy_decision",
    "consent_id",
    "result_summary",
    "verification_status",
    "attachment_id",
    "created_at",
    "chain_seq",
  ],
  capability_autonomy_transitions: [
    "id",
    "organization_id",
    "capability_id",
    "from_tier",
    "to_tier",
    "kind",
    "reason",
    "actor",
    "actor_user_id",
    "created_at",
    "chain_seq",
  ],
};

export type AuditChainRow = {
  id: string;
  chain_seq: number;
  prev_hash: string | null;
  row_hash: string;
  created_at: string;
  payload: unknown;
};

export type AuditChainBreak = {
  id: string;
  expected: string;
  actual: string;
  reason:
    | "hash_mismatch"
    | "prev_mismatch"
    | "seq_gap"
    | "anchor_hash_mismatch"
    | "anchor_missing";
};

type Admin = ReturnType<typeof createAdminClient>;
type RpcAdmin = {
  rpc(
    name: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export function computeRowHash(
  prevHash: string | null,
  payload: unknown
): string {
  return createHash("sha256")
    .update((prevHash ?? "") + canonical(payload))
    .digest("hex");
}

export async function fetchAuditChainRows(
  admin: Admin,
  organizationId: string,
  table: AuditChainTable,
  input: {
    since?: string | Date;
    afterSeq?: number;
    limit?: number;
  } = {}
): Promise<AuditChainRow[]> {
  const since =
    input.since instanceof Date ? input.since.toISOString() : input.since;
  const { data, error } = await (admin as unknown as RpcAdmin).rpc(
    "audit_chain_rows",
    {
      p_table: table,
      p_organization_id: organizationId,
      p_since: since ?? null,
      p_after_seq: input.afterSeq ?? 0,
      p_limit: input.limit ?? 500,
    }
  );
  if (error) throw error;
  return ((data ?? []) as AuditChainRow[]).map((row) => ({
    ...row,
    chain_seq: Number(row.chain_seq),
  }));
}

export async function findAuditChainStartSeq(
  admin: Admin,
  organizationId: string,
  table: AuditChainTable,
  since: string | Date
): Promise<number | null> {
  const [firstRow] = await fetchAuditChainRows(admin, organizationId, table, {
    since,
    afterSeq: 0,
    limit: 1,
  });
  return firstRow?.chain_seq ?? null;
}

export async function verifyChain(
  admin: Admin,
  organizationId: string,
  table: AuditChainTable,
  options: { since?: string | Date } = {}
): Promise<{
  ok: boolean;
  checked: number;
  firstBreak?: AuditChainBreak;
}> {
  const startSeq =
    options.since === undefined
      ? null
      : await findAuditChainStartSeq(
          admin,
          organizationId,
          table,
          options.since
        );
  if (options.since !== undefined && startSeq === null) {
    return { ok: true, checked: 0 };
  }

  let afterSeq = startSeq === null ? 0 : startSeq - 1;
  let previousSeq: number | null = null;
  let previousHash: string | null = null;
  let checked = 0;
  const pageSize = 500;

  while (true) {
    const rows = await fetchAuditChainRows(admin, organizationId, table, {
      afterSeq,
      limit: pageSize,
    });
    for (const row of rows) {
      checked += 1;
      if (previousSeq !== null) {
        const expectedSeq: number = previousSeq + 1;
        if (row.chain_seq !== expectedSeq) {
          return {
            ok: false,
            checked,
            firstBreak: {
              id: row.id,
              expected: String(expectedSeq),
              actual: String(row.chain_seq),
              reason: "seq_gap",
            },
          };
        }
        if (row.prev_hash !== previousHash) {
          return {
            ok: false,
            checked,
            firstBreak: {
              id: row.id,
              expected: previousHash ?? "",
              actual: row.prev_hash ?? "",
              reason: "prev_mismatch",
            },
          };
        }
      } else if (options.since === undefined) {
        if (row.chain_seq !== 1) {
          return {
            ok: false,
            checked,
            firstBreak: {
              id: row.id,
              expected: "1",
              actual: String(row.chain_seq),
              reason: "seq_gap",
            },
          };
        }
        if (row.prev_hash !== null) {
          return {
            ok: false,
            checked,
            firstBreak: {
              id: row.id,
              expected: "",
              actual: row.prev_hash,
              reason: "prev_mismatch",
            },
          };
        }
      }

      const expectedHash = computeRowHash(row.prev_hash, row.payload);
      if (row.row_hash !== expectedHash) {
        return {
          ok: false,
          checked,
          firstBreak: {
            id: row.id,
            expected: expectedHash,
            actual: row.row_hash,
            reason: "hash_mismatch",
          },
        };
      }
      previousSeq = row.chain_seq;
      previousHash = row.row_hash;
      afterSeq = row.chain_seq;
    }
    if (rows.length < pageSize) break;
  }

  return { ok: true, checked };
}
