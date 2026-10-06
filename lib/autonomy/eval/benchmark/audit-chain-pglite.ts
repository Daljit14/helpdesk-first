import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { verifyChain } from "@/lib/autonomy/audit/chain";

export const AUDIT_CHAIN_STUB_SCHEMA = `
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create role anon;
create role authenticated;
create role service_role;
create table public.organizations (
  id uuid primary key
);
create table public.resolution_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid,
  ticket_id uuid,
  kind text not null,
  actor text not null,
  from_status text,
  to_status text,
  detail jsonb not null default '{}'::jsonb,
  initiated_by text,
  versions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  organization_id uuid not null,
  seq integer not null,
  kind text not null,
  tool_name text,
  capability_id text,
  params_hash text,
  policy_decision text,
  consent_id uuid,
  result_summary text,
  verification_status text,
  attachment_id uuid,
  created_at timestamptz not null default now()
);
create table public.capability_autonomy_transitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  capability_id text not null,
  from_tier text,
  to_tier text not null,
  kind text not null,
  reason text,
  actor text not null,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);
create or replace function public.immutable_audit_row()
returns trigger language plpgsql as $$
begin
  raise exception 'audit row is immutable';
end $$;
create trigger resolution_events_immutable_trigger
  before update or delete on public.resolution_events
  for each row execute function public.immutable_audit_row();
create trigger agent_steps_immutable
  before update or delete on public.agent_steps
  for each row execute function public.immutable_audit_row();
create trigger capability_autonomy_transitions_immutable
  before update or delete on public.capability_autonomy_transitions
  for each row execute function public.immutable_audit_row();
set search_path to public, extensions;
`;

export async function createAuditChainPglite() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(AUDIT_CHAIN_STUB_SCHEMA);
  const migration = await readFile(
    join(process.cwd(), "supabase/audit-chain.sql"),
    "utf8"
  );
  return {
    db,
    migration,
    applyMigration: () => db.exec(migration),
  };
}

export async function runAuditChainScenario(
  scenario: "intact" | "delete_middle"
): Promise<{
  ok: boolean;
  firstBreakId: string | null;
  firstBreakReason: string | null;
}> {
  const { db, applyMigration } = await createAuditChainPglite();
  try {
    await applyMigration();
    const organizationId = "00000000-0000-4000-8000-000000000001";
    const ids = Array.from(
      { length: 5 },
      (_, index) =>
        `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
    );
    for (const [index, id] of ids.entries()) {
      await db.query(
        `insert into public.resolution_events (
          id, organization_id, kind, actor, detail
        ) values ($1::uuid, $2::uuid, 'eval_event', 'orchestrator', $3::jsonb)`,
        [id, organizationId, JSON.stringify({ index })]
      );
    }
    if (scenario === "delete_middle") {
      await db.exec(
        `alter table public.resolution_events disable trigger resolution_events_immutable_trigger;
         delete from public.resolution_events where chain_seq = 3;
         alter table public.resolution_events enable trigger resolution_events_immutable_trigger;`
      );
    }
    const verification = await verifyChain(
      {
        rpc: async (_name: string, args: Record<string, unknown>) => {
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
      } as never,
      organizationId,
      "resolution_events"
    );
    return {
      ok: verification.ok,
      firstBreakId: verification.firstBreak?.id ?? null,
      firstBreakReason: verification.firstBreak?.reason ?? null,
    };
  } finally {
    await db.close();
  }
}
