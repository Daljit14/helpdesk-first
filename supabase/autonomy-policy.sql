-- Phase 5C.5 (PR #67): per-organization autonomy policy grants consumed by the
-- deterministic policy engine (lib/autonomy/policy). Rows are optional; a
-- missing row means "no policies granted", which the engine treats as deny for
-- any capability that declares orgPolicyRequirements.

create table if not exists public.organization_autonomy_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  granted_policies text[] not null default '{}',
  require_approval_for text[] not null default '{}',
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.organization_autonomy_policies enable row level security;

drop policy if exists "Staff read autonomy policies" on public.organization_autonomy_policies;
create policy "Staff read autonomy policies" on public.organization_autonomy_policies
for select using (public.is_org_staff(organization_id));

-- Rollback:
-- drop policy if exists "Staff read autonomy policies" on public.organization_autonomy_policies;
-- drop table if exists public.organization_autonomy_policies;
