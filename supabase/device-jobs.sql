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
  snapshot_spec text[] not null default '{}',
  snapshot_hash text,
  snapshot_kinds text[] not null default '{}',
  error text,
  reported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.device_jobs
  add column if not exists snapshot_spec text[] not null default '{}';

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

drop function if exists public.lease_device_jobs(uuid, integer);
create or replace function public.lease_device_jobs(
  device uuid, n integer, p_lease_seconds integer default 600
) returns setof public.device_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.device_jobs
  set status = 'leased', leased_at = now(),
      lease_expires_at = now() + make_interval(
        secs => greatest(least(p_lease_seconds, 3600), 60)
      ),
      updated_at = now()
  where id in (
    select id from public.device_jobs
    where device_id = device and status = 'queued' and expires_at > now()
    order by created_at asc
    for update skip locked limit greatest(least(n, 10), 1)
  )
  returning public.device_jobs.*;
end $$;
revoke execute on function public.lease_device_jobs(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.lease_device_jobs(uuid, integer, integer)
  to service_role;

create or replace function public.reclaim_expired_device_jobs(
  p_organization_id uuid default null,
  p_device_id uuid default null,
  p_actor uuid default null
) returns setof public.device_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with reclaimed as (
    update public.device_jobs
    set status = 'expired',
        error = case
          when status = 'leased' and lease_expires_at < now()
            then 'lease_expired'
          else 'ttl_expired'
        end,
        result = result || jsonb_build_object(
          'reclaimed_at', now(),
          'review_required', (mode = 'execute' and status = 'leased')
        ),
        updated_at = now()
    where status in ('queued', 'leased')
      and (
        (status = 'leased' and lease_expires_at < now())
        or expires_at < now()
      )
      and (
        p_organization_id is null
        or organization_id = p_organization_id
      )
      and (p_device_id is null or device_id = p_device_id)
    returning *
  ), audited as (
    insert into public.operations_audit(
      organization_id,
      actor_user_id,
      actor_role,
      action,
      target
    )
    select
      organization_id,
      coalesce(
        p_actor,
        '00000000-0000-0000-0000-000000000000'::uuid
      ),
      'system',
      'device.job_reclaimed',
      'job:' || id || ' reason:' || error || ' mode:' || mode
    from reclaimed
    returning 1
  )
  select reclaimed.* from reclaimed;
end $$;
revoke execute on function public.reclaim_expired_device_jobs(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reclaim_expired_device_jobs(uuid, uuid, uuid)
  to service_role;

create or replace function public.cancel_device_job(
  p_job_id uuid,
  p_organization_id uuid,
  p_actor uuid,
  p_reason text
) returns setof public.device_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with changed as (
    update public.device_jobs
    set status = 'cancelled',
        error = 'cancelled_by_admin',
        result = result || jsonb_build_object(
          'cancel_reason', p_reason,
          'cancelled_by', p_actor,
          'cancelled_at', now()
        ),
        updated_at = now()
    where id = p_job_id
      and organization_id = p_organization_id
      and status in ('queued', 'leased')
    returning *
  ), audited as (
    insert into public.operations_audit(
      organization_id, actor_user_id, actor_role, action, target
    )
    select organization_id, p_actor, 'org_admin', 'device.job_cancelled',
      'job:' || id || ' reason:' || p_reason
    from changed
    returning 1
  )
  select changed.* from changed;
end $$;
revoke execute on function public.cancel_device_job(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_device_job(uuid, uuid, uuid, text)
  to service_role;

create or replace function public.expire_device_jobs_for_device(
  p_device_id uuid,
  p_organization_id uuid,
  p_actor uuid,
  p_reason text
) returns setof public.device_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with changed as (
    update public.device_jobs
    set status = 'expired',
        error = p_reason,
        updated_at = now()
    where device_id = p_device_id
      and organization_id = p_organization_id
      and status in ('queued', 'leased')
    returning *
  ), audited as (
    insert into public.operations_audit(
      organization_id, actor_user_id, actor_role, action, target
    )
    select organization_id, p_actor, 'org_admin',
      'device.jobs_expired_for_device',
      'device:' || p_device_id || ' reason:' || p_reason
    from changed
    returning 1
  )
  select changed.* from changed;
end $$;
revoke execute on function public.expire_device_jobs_for_device(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.expire_device_jobs_for_device(uuid, uuid, uuid, text)
  to service_role;

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
drop policy if exists device_jobs_staff on public.device_jobs;
create policy device_jobs_staff on public.device_jobs
  for select using (public.is_org_staff(organization_id));
drop policy if exists device_jobs_admin_cancel on public.device_jobs;
create policy device_jobs_admin_cancel on public.device_jobs
  for update
  using (public.is_org_admin(organization_id) and status in ('queued', 'leased'))
  with check (public.is_org_admin(organization_id) and status = 'cancelled');
drop policy if exists device_jobs_service on public.device_jobs;
create policy device_jobs_service on public.device_jobs
  for all to service_role using (true) with check (true);
drop policy if exists device_consent_policies_admin on public.device_consent_policies;
create policy device_consent_policies_admin on public.device_consent_policies
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));
drop policy if exists device_consent_policies_service on public.device_consent_policies;
create policy device_consent_policies_service on public.device_consent_policies
  for all to service_role using (true) with check (true);
revoke all on public.device_jobs, public.device_consent_policies from anon, authenticated;
grant select on public.device_jobs to authenticated;
grant update (status, error, result, updated_at)
  on public.device_jobs to authenticated;
