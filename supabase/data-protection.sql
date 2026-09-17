create table if not exists public.organization_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key_version integer not null check (key_version > 0),
  kek_id text not null,
  wrapped_dek text not null,
  status text not null check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (organization_id, key_version)
);

create unique index if not exists organization_keys_one_active_idx
  on public.organization_keys(organization_id) where status = 'active';

create table if not exists public.data_protection_backfill (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  table_name text not null,
  column_name text not null,
  last_processed_id text,
  encrypted_count integer not null default 0,
  plaintext_remaining integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, table_name, column_name)
);

alter table public.organization_keys enable row level security;
alter table public.data_protection_backfill enable row level security;

revoke all on public.organization_keys from anon, authenticated;
revoke all on public.data_protection_backfill from anon, authenticated;

create policy data_protection_organization_keys_service_role
  on public.organization_keys for all to service_role
  using (true) with check (true);

create policy data_protection_backfill_service_role
  on public.data_protection_backfill for all to service_role
  using (true) with check (true);

create or replace function public.guard_organization_key_updates()
returns trigger
language plpgsql
as $$
begin
  if new.organization_id <> old.organization_id
    or new.key_version <> old.key_version
    or new.kek_id <> old.kek_id
    or new.wrapped_dek <> old.wrapped_dek
    or new.created_at <> old.created_at
  then
    raise exception 'organization key envelope is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists organization_keys_guard_updates on public.organization_keys;
create trigger organization_keys_guard_updates
before update on public.organization_keys
for each row execute function public.guard_organization_key_updates();
