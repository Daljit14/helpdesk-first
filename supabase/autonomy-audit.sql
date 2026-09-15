-- Phase 5C.7 — rollback, persisted circuit breaker and audit provenance.
-- Run after autonomy-orchestrator.sql and autonomy-policy.sql.

-- Provenance columns on every append-only autonomy audit table.
alter table public.resolution_events
  add column if not exists initiated_by text,
  add column if not exists versions jsonb not null default '{}'::jsonb;
alter table public.policy_decisions
  add column if not exists initiated_by text,
  add column if not exists versions jsonb not null default '{}'::jsonb;
alter table public.capability_executions
  add column if not exists initiated_by text,
  add column if not exists versions jsonb not null default '{}'::jsonb;
alter table public.verification_results
  add column if not exists initiated_by text,
  add column if not exists versions jsonb not null default '{}'::jsonb;
alter table public.rollback_runs
  add column if not exists initiated_by text,
  add column if not exists versions jsonb not null default '{}'::jsonb;

-- Persisted per-organization, per-capability circuit breaker state.
-- This table is mutable state, not audit history, so it is not immutable.
create table if not exists public.capability_breakers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capability_id text not null,
  state text not null default 'closed' check (state in ('closed', 'open', 'half_open')),
  failures integer not null default 0 check (failures >= 0),
  opened_at timestamptz,
  cooldown_until timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, capability_id)
);
create index if not exists capability_breakers_organization_idx
  on public.capability_breakers(organization_id);

alter table public.capability_breakers enable row level security;
drop policy if exists "Staff read capability breakers" on public.capability_breakers;
create policy "Staff read capability breakers" on public.capability_breakers
for select using (public.is_org_staff(organization_id));

-- Rollback (manual):
-- drop table if exists public.capability_breakers;
-- alter table public.resolution_events drop column if exists initiated_by, drop column if exists versions;
-- alter table public.policy_decisions drop column if exists initiated_by, drop column if exists versions;
-- alter table public.capability_executions drop column if exists initiated_by, drop column if exists versions;
-- alter table public.verification_results drop column if exists initiated_by, drop column if exists versions;
-- alter table public.rollback_runs drop column if exists initiated_by, drop column if exists versions;
