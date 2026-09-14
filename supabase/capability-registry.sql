-- Phase 5C.3 — approved capability registry (DB mirror of lib/autonomy/capabilities).
-- The code registry is authoritative; these tables hold enablement, review dates
-- and version status so staff can see and organisations can opt in.

create table if not exists public.capabilities (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{2,63}$'),
  department text not null,
  description text not null check (length(description) <= 500),
  side_effects text not null
    check (side_effects in ('read_only', 'internal_write', 'external_write')),
  owner text not null,
  review_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capability_versions (
  capability_id text not null references public.capabilities(id) on delete cascade,
  version integer not null check (version >= 1),
  platforms jsonb not null default '["any"]'::jsonb,
  risk_level text not null
    check (risk_level in ('safe', 'caution', 'approval', 'specialist', 'denied')),
  consent text not null check (consent in ('none', 'user', 'technician')),
  org_policy_requirements jsonb not null default '[]'::jsonb,
  max_runtime_ms integer not null check (max_runtime_ms between 1000 and 600000),
  expected_result text not null,
  verification text not null,
  rollback text not null,
  input_schema jsonb not null,
  checksum text not null,
  status text not null default 'active'
    check (status in ('active', 'deprecated', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (capability_id, version)
);

create table if not exists public.organization_capabilities (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  capability_id text not null references public.capabilities(id) on delete cascade,
  min_version integer not null default 1 check (min_version >= 1),
  enabled boolean not null default false,
  enabled_by text,
  enabled_at timestamptz not null default now(),
  primary key (organization_id, capability_id)
);
create index if not exists organization_capabilities_org_idx
  on public.organization_capabilities(organization_id);

alter table public.capabilities enable row level security;
alter table public.capability_versions enable row level security;
alter table public.organization_capabilities enable row level security;

drop policy if exists capabilities_read on public.capabilities;
create policy capabilities_read on public.capabilities
  for select to authenticated using (true);

drop policy if exists capability_versions_read on public.capability_versions;
create policy capability_versions_read on public.capability_versions
  for select to authenticated using (true);

drop policy if exists organization_capabilities_staff_read on public.organization_capabilities;
create policy organization_capabilities_staff_read on public.organization_capabilities
  for select to authenticated using (public.is_org_staff(organization_id));

drop policy if exists organization_capabilities_admin_insert on public.organization_capabilities;
create policy organization_capabilities_admin_insert on public.organization_capabilities
  for insert to authenticated with check (public.is_org_admin(organization_id));

drop policy if exists organization_capabilities_admin_update on public.organization_capabilities;
create policy organization_capabilities_admin_update on public.organization_capabilities
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- Rollback:
-- drop table if exists public.organization_capabilities;
-- drop table if exists public.capability_versions;
-- drop table if exists public.capabilities;
