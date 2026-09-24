create table if not exists public.record_exclusions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  table_name text not null check (table_name in ('tickets', 'resolution_runs')),
  record_id uuid not null,
  reason text not null check (length(btrim(reason)) >= 3),
  excluded_by uuid,
  excluded_at timestamptz not null default now(),
  unique (organization_id, table_name, record_id)
);

create index if not exists record_exclusions_org_table_idx
  on public.record_exclusions(organization_id, table_name);

alter table public.record_exclusions enable row level security;
drop policy if exists record_exclusions_staff_read on public.record_exclusions;
create policy record_exclusions_staff_read on public.record_exclusions
  for select using (public.is_org_staff(organization_id));
drop policy if exists record_exclusions_service on public.record_exclusions;
create policy record_exclusions_service on public.record_exclusions
  for all to service_role using (true) with check (true);

create or replace function public.record_exclusions_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'record_exclusions is append-only';
end $$;
drop trigger if exists record_exclusions_append_only on public.record_exclusions;
create trigger record_exclusions_append_only
  before update or delete on public.record_exclusions
  for each row execute function public.record_exclusions_append_only();

revoke all on public.record_exclusions from anon, authenticated;
grant select on public.record_exclusions to authenticated;

insert into public.record_exclusions(
  organization_id, table_name, record_id, reason, excluded_by
)
select
  '00000000-0000-0000-0000-000000000001',
  'resolution_runs',
  'aab67284-a508-4cf9-8375-9b81075d8ce1',
  'pre-pilot test fixture',
  null
where exists (
  select 1 from public.resolution_runs
  where id = 'aab67284-a508-4cf9-8375-9b81075d8ce1'
)
on conflict (organization_id, table_name, record_id) do nothing;

insert into public.record_exclusions(
  organization_id, table_name, record_id, reason, excluded_by
)
select
  '00000000-0000-0000-0000-000000000001',
  'tickets',
  'da12ae6e-4201-4541-b6da-3de9da7c7e8e',
  'pre-pilot test fixture',
  null
where exists (
  select 1 from public.tickets
  where id = 'da12ae6e-4201-4541-b6da-3de9da7c7e8e'
)
on conflict (organization_id, table_name, record_id) do nothing;
