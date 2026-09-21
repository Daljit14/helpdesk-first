-- Phase B1 local device-agent core. Create and review; do not apply automatically.
create table if not exists public.device_enrollment_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token_hash text not null unique,
  device_class text not null check (device_class in ('managed', 'byod')),
  label text not null check (length(label) between 1 and 200),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses int not null default 1 check (max_uses between 1 and 50),
  used_count int not null default 0 check (used_count >= 0),
  revoked_at timestamptz
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  device_class text not null check (device_class in ('managed', 'byod')),
  platform text not null check (platform in ('windows', 'macos', 'linux')),
  hostname text not null check (length(hostname) between 1 and 128),
  agent_version text not null,
  public_key text not null unique,
  catalog_version text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  enrolled_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoke_reason text
);
create index if not exists devices_org_status_idx on public.devices(organization_id, status);

create table if not exists public.device_nonces (
  device_id uuid not null references public.devices(id) on delete cascade,
  nonce text not null,
  expires_at timestamptz not null,
  primary key (device_id, nonce)
);

create table if not exists public.device_diagnostics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete set null,
  kind text not null,
  ok boolean not null,
  summary text not null,
  data jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists device_diagnostics_device_idx
  on public.device_diagnostics(organization_id, device_id, collected_at desc);

create table if not exists public.device_shadow_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  action_id text not null,
  action_version int not null,
  parameters_hash text not null,
  reason text not null,
  evidence_kinds text[] not null default '{}',
  snapshot_spec text[] not null default '{}',
  irreversible boolean not null default false,
  catalog_version text not null,
  created_at timestamptz not null default now(),
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'agree', 'disagree', 'unsafe')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text
);

create or replace view public.devices_public
with (security_invoker = true) as
select id, organization_id, user_id, device_class, platform, hostname,
       agent_version, catalog_version, status, enrolled_at, last_seen_at,
       revoked_at, revoked_by, revoke_reason
from public.devices;

create or replace function public.device_diagnostics_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'device diagnostics are append-only';
end $$;
drop trigger if exists device_diagnostics_immutable on public.device_diagnostics;
create trigger device_diagnostics_immutable before update or delete
on public.device_diagnostics for each row execute function public.device_diagnostics_append_only();

create or replace function public.device_shadow_review_only()
returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.organization_id <> old.organization_id
    or new.device_id <> old.device_id or new.action_id <> old.action_id
    or new.action_version <> old.action_version
    or new.parameters_hash <> old.parameters_hash or new.reason <> old.reason
    or new.evidence_kinds <> old.evidence_kinds or new.snapshot_spec <> old.snapshot_spec
    or new.irreversible <> old.irreversible or new.catalog_version <> old.catalog_version
    or new.created_at <> old.created_at then
    raise exception 'device shadow action details are immutable';
  end if;
  return new;
end $$;
drop trigger if exists device_shadow_review_only on public.device_shadow_actions;
create trigger device_shadow_review_only before update on public.device_shadow_actions
for each row execute function public.device_shadow_review_only();

alter table public.device_enrollment_tokens enable row level security;
alter table public.devices enable row level security;
alter table public.device_nonces enable row level security;
alter table public.device_diagnostics enable row level security;
alter table public.device_shadow_actions enable row level security;

drop policy if exists device_enrollment_tokens_staff on public.device_enrollment_tokens;
create policy device_enrollment_tokens_staff on public.device_enrollment_tokens
  for select using (public.is_org_staff(organization_id));
drop policy if exists devices_staff on public.devices;
create policy devices_staff on public.devices
  for select using (public.is_org_staff(organization_id));
drop policy if exists device_nonces_service on public.device_nonces;
create policy device_nonces_service on public.device_nonces
  for all to service_role using (true) with check (true);
drop policy if exists device_enrollment_tokens_service on public.device_enrollment_tokens;
create policy device_enrollment_tokens_service on public.device_enrollment_tokens
  for all to service_role using (true) with check (true);
drop policy if exists devices_service on public.devices;
create policy devices_service on public.devices
  for all to service_role using (true) with check (true);
drop policy if exists device_diagnostics_service on public.device_diagnostics;
create policy device_diagnostics_service on public.device_diagnostics
  for all to service_role using (true) with check (true);
drop policy if exists device_diagnostics_staff on public.device_diagnostics;
create policy device_diagnostics_staff on public.device_diagnostics
  for select using (public.is_org_staff(organization_id));
drop policy if exists device_shadow_staff on public.device_shadow_actions;
create policy device_shadow_staff on public.device_shadow_actions
  for select using (public.is_org_staff(organization_id));
drop policy if exists device_shadow_service on public.device_shadow_actions;
create policy device_shadow_service on public.device_shadow_actions
  for all to service_role using (true) with check (true);
drop policy if exists device_shadow_admin_review on public.device_shadow_actions;
create policy device_shadow_admin_review on public.device_shadow_actions
  for update using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

revoke all on public.device_enrollment_tokens, public.devices,
  public.device_nonces, public.device_diagnostics, public.device_shadow_actions
  from anon, authenticated;
grant select on public.devices_public to authenticated;

-- Rollback: drop view public.devices_public; drop table public.device_shadow_actions,
-- device_diagnostics, device_nonces, devices, device_enrollment_tokens;
