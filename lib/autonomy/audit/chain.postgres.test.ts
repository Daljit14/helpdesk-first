import { afterAll, describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { verifyChain } from "./chain";
import { AUDIT_CHAIN_STUB_SCHEMA } from "@/lib/autonomy/eval/benchmark/audit-chain-pglite";

const connectionString = process.env.AUDIT_CHAIN_TEST_DATABASE_URL;
const pool = connectionString ? new Pool({ connectionString, max: 50 }) : null;
const organizationId = "00000000-0000-4000-8000-000000000001";

afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!connectionString)("Postgres audit-chain concurrency", () => {
  test("assigns a contiguous verified chain for 50 parallel inserts", async () => {
    if (!pool) throw new Error("AUDIT_CHAIN_TEST_DATABASE_URL is required.");
    const databaseUrl = new URL(connectionString!);
    if (
      !["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) ||
      databaseUrl.pathname !== "/audit_chain_test"
    ) {
      throw new Error(
        "Concurrency test only runs against local audit_chain_test."
      );
    }
    for (const role of ["anon", "authenticated", "service_role"]) {
      await pool.query(
        `do $$ begin
          if not exists (select 1 from pg_roles where rolname = '${role}') then
            create role ${role};
          end if;
        end $$;`
      );
    }
    await pool.query(`
      drop table if exists public.audit_chain_anchors cascade;
      drop table if exists public.resolution_events cascade;
      drop table if exists public.agent_steps cascade;
      drop table if exists public.capability_autonomy_transitions cascade;
      drop table if exists public.organizations cascade;
    `);
    await pool.query(
      AUDIT_CHAIN_STUB_SCHEMA.replace(
        /create role (anon|authenticated|service_role);\s*/g,
        ""
      )
    );
    const migration = await readFile("supabase/audit-chain.sql", "utf8");
    await pool.query(migration);

    const inserted = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        pool.query(
          `insert into public.resolution_events (
            organization_id, kind, actor, detail
          ) values ($1::uuid, 'parallel_insert', 'orchestrator', $2::jsonb)
          returning id, chain_seq`,
          [organizationId, JSON.stringify({ index })]
        )
      )
    );
    const sequences = inserted
      .flatMap((result) => result.rows.map((row) => Number(row.chain_seq)))
      .sort((left, right) => left - right);
    expect(sequences).toEqual(
      Array.from({ length: 50 }, (_, index) => index + 1)
    );

    const admin = {
      rpc: async (_name: string, args: Record<string, unknown>) => {
        const result = await pool.query(
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
    await expect(
      verifyChain(admin, organizationId, "resolution_events")
    ).resolves.toEqual({ ok: true, checked: 50 });
  });
});
