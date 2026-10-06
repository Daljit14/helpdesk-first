// @vitest-environment node

import { afterEach, describe, expect, test } from "vitest";
import { canonical } from "../guardrails/hash";
import { AUDIT_CHAIN_TABLES, computeRowHash, verifyChain } from "./chain";
import { createAuditChainPglite } from "@/lib/autonomy/eval/benchmark/audit-chain-pglite";

const organizationId = "00000000-0000-4000-8000-000000000001";
const ids = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
];

const databases: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

async function database() {
  const setup = await createAuditChainPglite();
  databases.push(setup.db);
  return setup;
}

function pgliteAdmin(
  db: Awaited<ReturnType<typeof createAuditChainPglite>>["db"]
) {
  return {
    rpc: async (
      name: string,
      args: Record<string, unknown>
    ): Promise<{ data: unknown; error: null }> => {
      if (name !== "audit_chain_rows") throw new Error("unexpected RPC");
      const result = await db.query(
        `select * from public.audit_chain_rows(
          $1::text, $2::uuid, $3::timestamptz, $4::bigint, $5::integer
        )`,
        [
          args.p_table,
          args.p_organization_id,
          args.p_since,
          args.p_after_seq,
          args.p_limit,
        ]
      );
      return { data: result.rows, error: null };
    },
  } as never;
}

async function insertResolutionEvent(
  db: Awaited<ReturnType<typeof createAuditChainPglite>>["db"],
  input: { id: string; createdAt: string; detail?: unknown }
) {
  await db.query(
    `insert into public.resolution_events (
      id, organization_id, kind, actor, detail, created_at
    ) values ($1::uuid, $2::uuid, 'test_event', 'orchestrator', $3::jsonb, $4::timestamptz)`,
    [
      input.id,
      organizationId,
      JSON.stringify(
        input.detail ?? {
          z: 'line\nquote"slash/',
          a: [1, 1e-7, 1e20, 1e21, -0],
          é: { nested: true },
        }
      ),
      input.createdAt,
    ]
  );
}

describe("audit-chain SQL in PGlite", () => {
  test("backfills repeatedly, matches TypeScript hashes, and ignores supplied chain fields", async () => {
    const { db, applyMigration } = await database();
    await insertResolutionEvent(db, {
      id: ids[1],
      createdAt: "2026-10-06T01:00:00.123456Z",
    });
    await insertResolutionEvent(db, {
      id: ids[0],
      createdAt: "2026-10-06T00:00:00.000001Z",
    });

    await applyMigration();
    const initial = await db.query<{
      id: string;
      chain_seq: number;
      prev_hash: string | null;
      row_hash: string;
    }>(
      `select id, chain_seq, prev_hash, row_hash
       from public.resolution_events order by chain_seq`
    );
    expect(initial.rows.map((row) => [row.id, row.chain_seq])).toEqual([
      [ids[0], 1],
      [ids[1], 2],
    ]);
    const hashesBeforeRepeat = initial.rows.map((row) => row.row_hash);
    await applyMigration();
    const repeated = await db.query<{ row_hash: string }>(
      `select row_hash from public.resolution_events order by chain_seq`
    );
    expect(repeated.rows.map((row) => row.row_hash)).toEqual(
      hashesBeforeRepeat
    );

    const rows = await db.query<{
      id: string;
      chain_seq: number;
      prev_hash: string | null;
      row_hash: string;
      payload: Record<string, unknown>;
    }>(
      `select * from public.audit_chain_rows(
        'resolution_events', $1::uuid, null, 0, 20
      )`,
      [organizationId]
    );
    expect(rows.rows).toHaveLength(2);
    for (const row of rows.rows) {
      expect(row.row_hash).toBe(computeRowHash(row.prev_hash, row.payload));
      expect(row.payload.created_at).toMatch(/Z$/);
    }
    expect(rows.rows[0].payload).toMatchObject({
      organization_id: organizationId,
      id: ids[0],
      chain_seq: 1,
    });
    const canonicalValue = {
      z: 'line\nquote"slash/',
      a: [1, 1e-7, 1e-6, 1e20, 1e21, -0, 5e-324],
      é: { nested: true },
    };
    const sqlCanonical = await db.query<{ audit_canonical: string }>(
      `select public.audit_canonical($1::jsonb)`,
      [JSON.stringify(canonicalValue)]
    );
    expect(sqlCanonical.rows[0].audit_canonical).toBe(
      canonical(canonicalValue)
    );
    const overflowCanonical = await db.query<{ audit_canonical: string }>(
      `select public.audit_canonical('1e400'::jsonb)`
    );
    expect(overflowCanonical.rows[0].audit_canonical).toBe(
      canonical(JSON.parse("1e400"))
    );

    await db.query(
      `insert into public.resolution_events (
        id, organization_id, kind, actor, chain_seq, prev_hash, row_hash
      ) values ($1::uuid, $2::uuid, 'client_fields', 'orchestrator', 999, 'client', 'client')`,
      [ids[2], organizationId]
    );
    const inserted = await db.query<{
      chain_seq: number;
      prev_hash: string | null;
      row_hash: string;
    }>(
      `select chain_seq, prev_hash, row_hash from public.resolution_events
       where id = $1::uuid`,
      [ids[2]]
    );
    expect(inserted.rows[0].chain_seq).toBe(3);
    expect(inserted.rows[0].prev_hash).toBe(rows.rows[1].row_hash);
    expect(
      await verifyChain(pgliteAdmin(db), organizationId, "resolution_events")
    ).toEqual({ ok: true, checked: 3 });

    await db.query(
      `insert into public.agent_steps (
        id, session_id, organization_id, seq, kind, tool_name,
        chain_seq, prev_hash, row_hash
      ) values (
        $1::uuid, $2::uuid, $3::uuid, 1, 'tool_call', 'read_status',
        999, 'client', 'client'
      )`,
      [ids[3], ids[4], organizationId]
    );
    await db.query(
      `insert into public.capability_autonomy_transitions (
        id, organization_id, capability_id, to_tier, kind, actor,
        chain_seq, prev_hash, row_hash
      ) values (
        $1::uuid, $2::uuid, 'search_status', 'assisted', 'promotion', 'org_admin',
        999, 'client', 'client'
      )`,
      [ids[4], organizationId]
    );
    for (const table of [
      "agent_steps",
      "capability_autonomy_transitions",
    ] as const) {
      const tableRows = await db.query<{
        chain_seq: number;
        prev_hash: string | null;
        row_hash: string;
        payload: Record<string, unknown>;
      }>(
        `select * from public.audit_chain_rows($1::text, $2::uuid, null, 0, 20)`,
        [table, organizationId]
      );
      expect(tableRows.rows).toHaveLength(1);
      expect(tableRows.rows[0].chain_seq).toBe(1);
      expect(tableRows.rows[0].prev_hash).toBeNull();
      expect(tableRows.rows[0].row_hash).toBe(
        computeRowHash(tableRows.rows[0].prev_hash, tableRows.rows[0].payload)
      );
      expect(await verifyChain(pgliteAdmin(db), organizationId, table)).toEqual(
        { ok: true, checked: 1 }
      );
    }

    await db.exec(
      `alter table public.resolution_events disable trigger resolution_events_immutable_trigger;
       update public.resolution_events set detail = '{"tampered":true}'::jsonb
         where id = '${ids[1]}'::uuid;
       alter table public.resolution_events enable trigger resolution_events_immutable_trigger;`
    );
    await expect(
      verifyChain(pgliteAdmin(db), organizationId, "resolution_events")
    ).resolves.toMatchObject({
      ok: false,
      firstBreak: { id: ids[1], reason: "hash_mismatch" },
    });
  });

  test("detects middle deletion at the row following the missing row", async () => {
    const { db, applyMigration } = await database();
    await applyMigration();
    for (let index = 0; index < 5; index += 1) {
      await insertResolutionEvent(db, {
        id: ids[index],
        createdAt: `2026-10-06T00:00:0${index}.000000Z`,
      });
    }
    const before = await db.query<{ id: string; chain_seq: number }>(
      `select id, chain_seq from public.resolution_events order by chain_seq`
    );
    await db.exec(
      `alter table public.resolution_events disable trigger resolution_events_immutable_trigger;
       delete from public.resolution_events where chain_seq = 3;
       alter table public.resolution_events enable trigger resolution_events_immutable_trigger;`
    );
    const verification = await verifyChain(
      pgliteAdmin(db),
      organizationId,
      "resolution_events"
    );
    expect(verification).toMatchObject({
      ok: false,
      firstBreak: {
        id: before.rows.find((row) => row.chain_seq === 4)?.id,
        reason: "seq_gap",
      },
    });
  });

  test("defines chains for all fixed audit tables", async () => {
    const { db, applyMigration } = await database();
    await applyMigration();
    for (const table of AUDIT_CHAIN_TABLES) {
      const result = await db.query(
        `select chain_seq, prev_hash, row_hash from public.${table} limit 0`
      );
      expect(result.rows).toEqual([]);
    }
  });

  test("keeps anchors append-only and grants their policy only to service role", async () => {
    const { db, applyMigration } = await database();
    await applyMigration();
    await db.query("insert into public.organizations(id) values ($1::uuid)", [
      organizationId,
    ]);
    await db.query(
      `insert into public.audit_chain_anchors (
        organization_id, table_name, chain_seq, row_hash
      ) values ($1::uuid, 'resolution_events', 1, 'hash')`,
      [organizationId]
    );
    await expect(
      db.query(
        `update public.audit_chain_anchors set row_hash = 'changed'
         where organization_id = $1::uuid`,
        [organizationId]
      )
    ).rejects.toThrow("append-only");
    await expect(
      db.query(
        `delete from public.audit_chain_anchors
         where organization_id = $1::uuid`,
        [organizationId]
      )
    ).rejects.toThrow("append-only");
    const policies = await db.query<{ roles: string[]; cmd: string }>(
      `select roles, cmd from pg_policies
       where schemaname = 'public' and tablename = 'audit_chain_anchors'`
    );
    expect(policies.rows).toContainEqual({
      roles: ["service_role"],
      cmd: "ALL",
    });
    const privileges = await db.query<{
      service_can_insert: boolean;
      service_can_update: boolean;
      service_can_truncate: boolean;
      anon_can_select: boolean;
    }>(
      `select
         has_table_privilege('service_role', 'public.audit_chain_anchors', 'INSERT') as service_can_insert,
         has_table_privilege('service_role', 'public.audit_chain_anchors', 'UPDATE') as service_can_update,
         has_table_privilege('service_role', 'public.audit_chain_anchors', 'TRUNCATE') as service_can_truncate,
         has_table_privilege('anon', 'public.audit_chain_anchors', 'SELECT') as anon_can_select`
    );
    expect(privileges.rows[0]).toEqual({
      service_can_insert: true,
      service_can_update: false,
      service_can_truncate: false,
      anon_can_select: false,
    });
  });
});
