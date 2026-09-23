create table if not exists public.device_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  step_id uuid references public.resolution_steps(id) on delete set null,
  execution_id uuid references public.capability_executions(id) on delete set null,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  action_id text not null,
  action_version integer not null,
  catalog_version text not null,
  parameters jsonb not null default '{}'::jsonb,
  parameter_hash text not null,
  mode text not null check (mode in ('shadow','execute')),
  kind text not null check (kind in ('action','rollback')),
  rollback_of uuid references public.device_jobs(id) on delete set null,
  status text not null default 'queued' check (status in
    ('queued','leased','succeeded','failed','shadowed','unsupported','expired','cancelled')),
  leased_at timestamptz,
  lease_expires_at timestamptz,
  expires_at timestamptz not null,
  result jsonb not null default '{}',
  snapshot_hash text,
  snapshot_kinds text[] not null default '{}',
  error text,
  reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.device_consent_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  device_class text not null check (device_class in ('managed','byod')),
  category text not null check (category in ('network','security','endpoint','peripheral')),
  auto_approve boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (organization_id, device_class, category)
);

create index if not exists device_jobs_device_status_idx
  on public.device_jobs(device_id, status);
create index if not exists device_jobs_run_idx on public.device_jobs(run_id);
create index if not exists device_jobs_org_created_idx
  on public.device_jobs(organization_id, created_at desc);

create or replace function public.lease_device_jobs(
  device uuid, n integer
) returns setof public.device_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.device_jobs
  set status = 'leased', leased_at = now(),
      lease_expires_at = now() + interval '5 minutes',
      updated_at = now()
  where id in (
    select id from public.device_jobs
    where device_id = device and status = 'queued' and expires_at > now()
    order by created_at asc
    for update skip locked limit greatest(least(n, 10), 1)
  )
  returning public.device_jobs.*;
end $$;

create or replace function public.device_jobs_terminal_immutable()
returns trigger language plpgsql as $$
begin
  if old.status in ('succeeded','failed','shadowed','unsupported','expired','cancelled')
    then raise exception 'terminal device jobs are immutable'; end if;
  return new;
end $$;
drop trigger if exists device_jobs_terminal_immutable on public.device_jobs;
create trigger device_jobs_terminal_immutable before update on public.device_jobs
for each row execute function public.device_jobs_terminal_immutable();

alter table public.device_jobs enable row level security;
alter table public.device_consent_policies enable row level security;
create policy device_jobs_staff on public.device_jobs
  for select using (public.is_org_staff(organization_id));
create policy device_jobs_service on public.device_jobs
  for all to service_role using (true) with check (true);
create policy device_consent_policies_admin on public.device_consent_policies
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
create policy device_consent_policies_service on public.device_consent_policies
  for all to service_role using (true) with check (true);
revoke all on public.device_jobs, public.device_consent_policies from anon, authenticated;
grant select on public.device_jobs to authenticated;
