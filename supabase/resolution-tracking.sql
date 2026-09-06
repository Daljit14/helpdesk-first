-- Run after schema.sql, cloud-features.sql, operations.sql, and admin-dashboard.sql.

alter table public.tickets
  add column if not exists resolution_source text
    check (resolution_source in ('ai', 'agent', 'self_service')),
  add column if not exists ai_attempted boolean not null default false,
  add column if not exists ai_attempted_at timestamptz,
  add column if not exists ai_recommended_issue_id text,
  add column if not exists escalated boolean not null default false,
  add column if not exists escalated_at timestamptz,
  add column if not exists escalation_reason text,
  add column if not exists resolution_summary text,
  add column if not exists user_confirmed boolean not null default false,
  add column if not exists user_confirmed_at timestamptz;

alter table public.tickets
  drop constraint if exists tickets_ai_requires_confirmation;

alter table public.tickets
  add constraint tickets_ai_requires_confirmation
  check (resolution_source is distinct from 'ai' or user_confirmed);

create index if not exists tickets_org_resolution_idx
  on public.tickets (organization_id, resolution_source);
create index if not exists tickets_org_ai_attempted_idx
  on public.tickets (organization_id, ai_attempted);

create or replace function public.tickets_track_resolution()
returns trigger
language plpgsql
as $$
begin
  if new.escalated and not old.escalated then
    new.escalated_at := coalesce(new.escalated_at, now());
  end if;

  if new.user_confirmed and not old.user_confirmed then
    new.user_confirmed_at := coalesce(new.user_confirmed_at, now());
  end if;

  if lower(new.status) in ('resolved', 'closed')
    and lower(old.status) not in ('resolved', 'closed')
    and new.resolution_source is null then
    if new.user_confirmed and new.ai_attempted and not new.escalated then
      new.resolution_source := 'ai';
    elsif new.user_confirmed and not new.escalated then
      new.resolution_source := 'self_service';
    else
      new.resolution_source := 'agent';
    end if;
  end if;

  if lower(new.status) not in ('resolved', 'closed')
    and lower(old.status) in ('resolved', 'closed') then
    new.resolution_source := null;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_track_resolution_trigger on public.tickets;
create trigger tickets_track_resolution_trigger
  before update on public.tickets
  for each row execute function public.tickets_track_resolution();

create or replace function public.tickets_guard_resolution_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated'
    and coalesce(current_setting('helpdesk.resolution_rpc', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      if new.resolution_source is not null
        or new.user_confirmed
        or new.user_confirmed_at is not null then
        raise exception 'resolution fields are managed by the resolution flow';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.resolution_source is distinct from old.resolution_source
        or new.user_confirmed is distinct from old.user_confirmed
        or new.user_confirmed_at is distinct from old.user_confirmed_at
        or new.ai_attempted is distinct from old.ai_attempted
        or new.ai_attempted_at is distinct from old.ai_attempted_at
        or new.ai_recommended_issue_id is distinct from old.ai_recommended_issue_id
        or new.escalated is distinct from old.escalated
        or new.escalated_at is distinct from old.escalated_at
        or new.resolution_summary is distinct from old.resolution_summary then
        raise exception 'resolution fields are managed by the resolution flow';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_guard_resolution_columns_trigger on public.tickets;
create trigger tickets_guard_resolution_columns_trigger
  before insert or update on public.tickets
  for each row execute function public.tickets_guard_resolution_columns();

create or replace function public.confirm_ticket_resolved(ticket uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('helpdesk.resolution_rpc', 'on', true);

  if not exists (
    select 1
    from public.tickets
    where id = ticket and user_id = auth.uid()
  ) then
    raise exception 'not found';
  end if;

  update public.tickets
  set user_confirmed = true,
      user_confirmed_at = now(),
      status = case
        when lower(status) in ('resolved', 'closed') then status
        else 'Resolved'
      end
  where id = ticket and user_id = auth.uid();
end;
$$;

revoke all on function public.confirm_ticket_resolved(uuid) from public, anon;
grant execute on function public.confirm_ticket_resolved(uuid) to authenticated;

create or replace function public.escalate_ticket(ticket uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('helpdesk.resolution_rpc', 'on', true);

  if not exists (
    select 1
    from public.tickets
    where id = ticket and user_id = auth.uid()
  ) then
    raise exception 'not found';
  end if;

  update public.tickets
  set escalated = true,
      escalated_at = now(),
      escalation_reason = left(reason, 1000),
      status = 'New',
      resolution_source = null,
      user_confirmed = false,
      user_confirmed_at = null
  where id = ticket and user_id = auth.uid();
end;
$$;

revoke all on function public.escalate_ticket(uuid, text) from public, anon;
grant execute on function public.escalate_ticket(uuid, text) to authenticated;

create or replace function public.admin_resolution_metrics(org uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with scoped as (
    select *
    from public.tickets
    where organization_id = org
  ),
  completed as (
    select *
    from scoped
    where lower(status) in ('resolved', 'closed')
  ),
  totals as (
    select
      count(*)::int as total_tickets,
      count(*) filter (
        where lower(status) in ('open', 'new', 'in progress', 'in_progress', 'in-progress', 'waiting')
      )::int as open_tickets,
      count(*) filter (where ai_attempted)::int as ai_attempted,
      count(*) filter (where resolution_source = 'ai')::int as ai_solved,
      count(*) filter (where resolution_source = 'agent')::int as agent_solved,
      count(*) filter (where resolution_source = 'self_service')::int as self_service_solved,
      count(*) filter (where escalated)::int as escalated,
      coalesce(
        avg(extract(epoch from (resolved_at - created_at)) / 60)
          filter (
            where lower(status) in ('resolved', 'closed')
              and resolved_at is not null
          ),
        0
      ) as avg_resolution_minutes,
      coalesce(
        avg(extract(epoch from (resolved_at - created_at)) / 60)
          filter (
            where lower(status) in ('resolved', 'closed')
              and resolved_at is not null
              and resolution_source = 'ai'
          ),
        0
      ) as avg_ai_resolution_minutes,
      coalesce(
        avg(extract(epoch from (resolved_at - created_at)) / 60)
          filter (
            where lower(status) in ('resolved', 'closed')
              and resolved_at is not null
              and resolution_source = 'agent'
          ),
        0
      ) as avg_agent_resolution_minutes
    from scoped
  ),
  days as (
    select generate_series(
      current_date - interval '13 days',
      current_date,
      interval '1 day'
    )::date as day
  ),
  daily as (
    select
      days.day,
      count(scoped.id) filter (where scoped.resolution_source = 'ai')::int as ai_solved,
      count(scoped.id) filter (where scoped.resolution_source = 'agent')::int as agent_solved,
      count(scoped.id) filter (where scoped.escalated)::int as escalated,
      count(scoped.id)::int as created
    from days
    left join scoped on scoped.created_at::date = days.day
    group by days.day
    order by days.day
  )
  select jsonb_build_object(
    'totalTickets', totals.total_tickets,
    'openTickets', totals.open_tickets,
    'aiAttempted', totals.ai_attempted,
    'aiSolved', totals.ai_solved,
    'agentSolved', totals.agent_solved,
    'selfServiceSolved', totals.self_service_solved,
    'escalated', totals.escalated,
    'aiResolutionRate', round(
      coalesce(totals.ai_solved * 100.0 / nullif(totals.ai_attempted, 0), 0)::numeric,
      1
    ),
    'avgResolutionMinutes', totals.avg_resolution_minutes,
    'avgAiResolutionMinutes', totals.avg_ai_resolution_minutes,
    'avgAgentResolutionMinutes', totals.avg_agent_resolution_minutes,
    'daily', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'day', to_char(daily.day, 'YYYY-MM-DD'),
          'aiSolved', daily.ai_solved,
          'agentSolved', daily.agent_solved,
          'escalated', daily.escalated,
          'created', daily.created
        ) order by daily.day)
        from daily
      ),
      '[]'::jsonb
    )
  )
  from totals;
$$;

revoke all on function public.admin_resolution_metrics(uuid) from public, anon, authenticated;
grant execute on function public.admin_resolution_metrics(uuid) to service_role;

-- Optional destructive rollback; run only with approval:
-- drop function if exists public.admin_resolution_metrics(uuid);
-- drop function if exists public.escalate_ticket(uuid, text);
-- drop function if exists public.confirm_ticket_resolved(uuid);
-- drop trigger if exists tickets_guard_resolution_columns_trigger on public.tickets;
-- drop trigger if exists tickets_track_resolution_trigger on public.tickets;
-- drop function if exists public.tickets_guard_resolution_columns();
-- drop function if exists public.tickets_track_resolution();
-- alter table public.tickets drop constraint if exists tickets_ai_requires_confirmation;
-- alter table public.tickets drop column if exists resolution_source;
-- alter table public.tickets drop column if exists ai_attempted;
-- alter table public.tickets drop column if exists ai_attempted_at;
-- alter table public.tickets drop column if exists ai_recommended_issue_id;
-- alter table public.tickets drop column if exists escalated;
-- alter table public.tickets drop column if exists escalated_at;
-- alter table public.tickets drop column if exists escalation_reason;
-- alter table public.tickets drop column if exists resolution_summary;
-- alter table public.tickets drop column if exists user_confirmed;
-- alter table public.tickets drop column if exists user_confirmed_at;
-- drop index if exists public.tickets_org_resolution_idx;
-- drop index if exists public.tickets_org_ai_attempted_idx;
