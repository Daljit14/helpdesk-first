-- Production Level-1 identity connectors. Apply only through the reviewed migration process.
create table if not exists public.organization_connectors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('entra', 'google')),
  config jsonb not null default '{}'::jsonb,
  secret_ciphertext text not null,
  key_id text not null,
  allowed_group_ids text[] not null default '{}',
  reset_url text,
  status text not null default 'disabled' check (status in ('active', 'disabled', 'error')),
  last_health_at timestamptz,
  last_health_ok boolean,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index if not exists organization_connectors_org_idx on public.organization_connectors(organization_id);
alter table public.organization_connectors enable row level security;
drop policy if exists organization_connectors_admin on public.organization_connectors;
create policy organization_connectors_admin on public.organization_connectors
  for all using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create or replace view public.organization_connectors_public
with (security_invoker = true) as
  select id, organization_id, provider, config, allowed_group_ids, reset_url, status,
         last_health_at, last_health_ok, created_by, updated_at
  from public.organization_connectors;
revoke all on public.organization_connectors_public from anon;
grant select on public.organization_connectors_public to authenticated;
revoke select (secret_ciphertext, key_id)
  on public.organization_connectors from authenticated, anon;

create table if not exists public.identity_bindings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('entra', 'google')),
  directory_user_id text not null,
  matched_email_hash text not null,
  bound_at timestamptz not null default now()
);
create index if not exists identity_bindings_run_idx on public.identity_bindings(organization_id, run_id, bound_at desc);
alter table public.identity_bindings enable row level security;
drop policy if exists identity_bindings_staff_read on public.identity_bindings;
create policy identity_bindings_staff_read on public.identity_bindings for select using (public.is_org_staff(organization_id));
create or replace function public.identity_bindings_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'identity bindings are append-only';
end $$;
drop trigger if exists identity_bindings_immutable on public.identity_bindings;
create trigger identity_bindings_immutable before update or delete on public.identity_bindings
for each row execute function public.identity_bindings_immutable();

create table if not exists public.verification_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists verification_links_lookup_idx on public.verification_links(token_hash, expires_at);
alter table public.verification_links enable row level security;
drop policy if exists verification_links_requester_read on public.verification_links;
create policy verification_links_requester_read on public.verification_links for select using (auth.uid() = user_id);
drop policy if exists verification_links_service on public.verification_links;
create policy verification_links_service on public.verification_links
  for all to service_role using (true) with check (true);
