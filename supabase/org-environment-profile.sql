-- Additive, idempotent D5 schema. Apply after wave-3-organizations.sql and investigation.sql.

create table if not exists public.org_environment_profile (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  vpn_client text null check (
    vpn_client is null or char_length(vpn_client) <= 80
  ),
  mdm_provider text null check (
    mdm_provider in (
      'intune', 'jamf', 'kandji', 'workspace_one', 'google_endpoint', 'none', 'other'
    )
  ),
  email_stack text null check (
    email_stack in ('microsoft365', 'google_workspace', 'other')
  ),
  chat_stack text null check (
    chat_stack in ('teams', 'slack', 'google_chat', 'zoom', 'other')
  ),
  sso_provider text null check (
    sso_provider in ('entra', 'google', 'okta', 'none', 'other')
  ),
  standard_platforms text[] not null default '{}'
    check (
      cardinality(standard_platforms) <= 5
      and standard_platforms <@ array['Windows', 'Mac', 'iOS', 'Android', 'Other']::text[]
    ),
  standard_os_versions text[] not null default '{}'
    check (cardinality(standard_os_versions) <= 10),
  printer_fleet text[] not null default '{}'
    check (cardinality(printer_fleet) <= 20),
  approved_software text[] not null default '{}'
    check (cardinality(approved_software) <= 50),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  check (
    status = 'draft'
    or (confirmed_by is not null and confirmed_at is not null)
  )
);

alter table public.org_environment_profile enable row level security;

drop policy if exists org_environment_profile_member_select
  on public.org_environment_profile;
create policy org_environment_profile_member_select
  on public.org_environment_profile for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists org_environment_profile_admin_insert
  on public.org_environment_profile;
create policy org_environment_profile_admin_insert
  on public.org_environment_profile for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists org_environment_profile_admin_update
  on public.org_environment_profile;
create policy org_environment_profile_admin_update
  on public.org_environment_profile for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

revoke all on public.org_environment_profile from anon;
grant select, insert, update on public.org_environment_profile to authenticated;
grant all on public.org_environment_profile to service_role;

-- Rollback: drop table if exists public.org_environment_profile;
