-- Run after schema.sql, cloud-features.sql, and operations.sql.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'HelpDesk First')
on conflict (id) do nothing;

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'support_agent')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  mfa_enrolled boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.tickets
  add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.organizations(id),
  add column if not exists category text;

create index if not exists tickets_org_created_idx
  on public.tickets (organization_id, created_at desc);
create index if not exists tickets_org_status_idx
  on public.tickets (organization_id, status);

create table if not exists public.ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  organization_id uuid not null,
  event_type text not null check (event_type in ('created', 'status_changed', 'assigned', 'priority_changed')),
  from_value text,
  to_value text,
  created_at timestamptz not null default now()
);

create index if not exists ticket_events_ticket_idx
  on public.ticket_events (ticket_id, created_at);

alter table public.analytics_events
  add column if not exists organization_id uuid not null default '00000000-0000-0000-0000-000000000001';
alter table public.analytics_events
  drop constraint if exists analytics_events_event_type_check;
alter table public.analytics_events
  add constraint analytics_events_event_type_check check (
    event_type in (
      'page_view', 'guide_view', 'assistant_start',
      'ai_recommendation_accepted', 'ai_recommendation_rejected',
      'troubleshooting_completed', 'ticket_created', 'ticket_status_changed'
    )
  );

create table if not exists public.active_sessions (
  session_key text primary key,
  organization_id uuid not null default '00000000-0000-0000-0000-000000000001',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists active_sessions_last_seen_idx
  on public.active_sessions (last_seen_at);

create table if not exists public.analytics_daily_totals (
  day date not null,
  organization_id uuid not null,
  event_type text not null,
  total int not null default 0,
  primary key (day, organization_id, event_type)
);

create table if not exists public.operations_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  actor_user_id uuid not null,
  actor_role text not null,
  action text not null,
  target text,
  created_at timestamptz not null default now()
);
create index if not exists operations_audit_org_created_idx
  on public.operations_audit (organization_id, created_at desc);

create or replace function public.is_org_member(org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org and user_id = auth.uid()
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;
alter table public.active_sessions enable row level security;
alter table public.analytics_daily_totals enable row level security;
alter table public.operations_audit enable row level security;

drop policy if exists "Members can view their membership" on public.organization_members;
create policy "Members can view their membership"
  on public.organization_members for select
  using (user_id = auth.uid());
drop policy if exists "Members can view their organization" on public.organizations;
create policy "Members can view their organization"
  on public.organizations for select
  using (public.is_org_member(id));
drop policy if exists "Members can view their profile" on public.admin_profiles;
create policy "Members can view their profile"
  on public.admin_profiles for select
  using (user_id = auth.uid());
drop policy if exists "Members can update their profile" on public.admin_profiles;
create policy "Members can update their profile"
  on public.admin_profiles for update
  using (user_id = auth.uid());
drop policy if exists "Org members read org tickets" on public.tickets;
create policy "Org members read org tickets"
  on public.tickets for select
  using (public.is_org_member(organization_id));
drop policy if exists "Org members read ticket events" on public.ticket_events;
create policy "Org members read ticket events"
  on public.ticket_events for select
  using (public.is_org_member(organization_id));

create or replace function public.tickets_log_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_events(ticket_id, organization_id, event_type, to_value)
    values (new.id, new.organization_id, 'created', new.status);
  else
    if new.status is distinct from old.status then
      insert into public.ticket_events(ticket_id, organization_id, event_type, from_value, to_value)
      values (new.id, new.organization_id, 'status_changed', old.status, new.status);
      insert into public.analytics_events(event_type, issue_id, visitor_key, organization_id)
      values ('ticket_status_changed', new.issue_id, 'server', new.organization_id);
    end if;
    if new.assigned_agent is distinct from old.assigned_agent then
      insert into public.ticket_events(ticket_id, organization_id, event_type, from_value, to_value)
      values (new.id, new.organization_id, 'assigned', old.assigned_agent, new.assigned_agent);
    end if;
    if new.priority is distinct from old.priority then
      insert into public.ticket_events(ticket_id, organization_id, event_type, from_value, to_value)
      values (new.id, new.organization_id, 'priority_changed', old.priority, new.priority);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_log_events_trigger on public.tickets;
create trigger tickets_log_events_trigger
  after insert or update on public.tickets
  for each row execute function public.tickets_log_events();

create or replace function public.analytics_retention_rollup()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analytics_daily_totals(day, organization_id, event_type, total)
  select created_at::date, organization_id, event_type, count(*)::int
  from public.analytics_events
  where created_at < now() - interval '30 days'
  group by created_at::date, organization_id, event_type
  on conflict (day, organization_id, event_type)
  do update set total = public.analytics_daily_totals.total + excluded.total;
  delete from public.analytics_events where created_at < now() - interval '30 days';
  delete from public.active_sessions where last_seen_at < now() - interval '1 day';
end;
$$;

revoke all on function public.analytics_retention_rollup()
  from public, anon, authenticated;
grant execute on function public.analytics_retention_rollup() to service_role;

create or replace function public.admin_operations_metrics(org uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with scoped as (
    select * from public.tickets where organization_id = org
  ),
  open_tickets as (
    select * from scoped where lower(status) in ('open', 'new', 'in progress', 'in_progress', 'waiting')
  ),
  completed as (
    select * from scoped where lower(status) in ('resolved', 'closed')
  ),
  workload as (
    select
      coalesce(assigned_agent, 'Unassigned') as agent,
      count(*) filter (where lower(status) in ('open', 'new', 'in progress', 'in_progress', 'waiting')) as open,
      count(*) filter (where lower(priority) = 'urgent' and lower(status) in ('open', 'new', 'in progress', 'in_progress', 'waiting')) as urgent,
      count(*) filter (where lower(status) in ('open', 'new', 'in progress', 'in_progress', 'waiting')
        and created_at + case lower(priority) when 'urgent' then interval '4 hours' when 'high' then interval '8 hours' when 'low' then interval '72 hours' else interval '24 hours' end < now()) as breached,
      count(*) filter (where lower(status) = 'waiting') as waiting,
      count(*) filter (where lower(status) in ('resolved', 'closed') and resolved_at >= date_trunc('day', now())) as resolved_today
    from scoped group by coalesce(assigned_agent, 'Unassigned')
  )
  select jsonb_build_object(
    'activeUsers', (select count(*) from public.active_sessions where organization_id = org and last_seen_at > now() - interval '5 minutes'),
    'uniqueVisitorsToday', (select count(distinct visitor_key) from public.analytics_events where organization_id = org and created_at >= date_trunc('day', now()) and visitor_key <> 'server'),
    'pageViewsToday', (select count(*) from public.analytics_events where organization_id = org and created_at >= date_trunc('day', now()) and event_type in ('page_view', 'guide_view')),
    'totalTickets', (select count(*) from scoped),
    'openTickets', (select count(*) from open_tickets),
    'newTickets', (select count(*) from open_tickets where lower(status) in ('open', 'new')),
    'inProgressTickets', (select count(*) from open_tickets where lower(status) in ('in progress', 'in_progress')),
    'waitingTickets', (select count(*) from open_tickets where lower(status) = 'waiting'),
    'urgentOpenTickets', (select count(*) from open_tickets where lower(priority) = 'urgent'),
    'completedToday', (select count(*) from completed where resolved_at >= date_trunc('day', now())),
    'totalCompleted', (select count(*) from completed),
    'slaBreached', (select count(*) from open_tickets where created_at + case lower(priority) when 'urgent' then interval '4 hours' when 'high' then interval '8 hours' when 'low' then interval '72 hours' else interval '24 hours' end < now()),
    'avgFirstResponseMinutes', (select coalesce(avg(extract(epoch from (first_response_at - created_at)) / 60), 0) from scoped where first_response_at is not null and first_response_at >= now() - interval '30 days'),
    'avgResolutionMinutes', (select coalesce(avg(extract(epoch from (resolved_at - created_at)) / 60), 0) from completed where resolved_at is not null and resolved_at >= now() - interval '30 days'),
    'ticketsByCategory', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'count', count)) from (select coalesce(category, 'Other') key, count(*)::int count from scoped group by coalesce(category, 'Other') order by count desc) x), '[]'::jsonb),
    'ticketsByPlatform', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'count', count)) from (select coalesce(platform, 'Other') key, count(*)::int count from scoped group by coalesce(platform, 'Other') order by count desc) x), '[]'::jsonb),
    'agentWorkload', coalesce((select jsonb_agg(jsonb_build_object('agent', agent, 'open', open, 'urgent', urgent, 'breached', breached, 'waiting', waiting, 'resolvedToday', resolved_today)) from workload), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_operations_metrics(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_operations_metrics(uuid) to service_role;

-- Optional retention schedule (requires pg_cron):
-- select cron.schedule('analytics-retention', '15 3 * * *', $$select public.analytics_retention_rollup()$$);

-- Destructive rollback; run only with approval:
-- drop function if exists public.admin_operations_metrics(uuid);
-- drop function if exists public.analytics_retention_rollup();
-- drop function if exists public.tickets_log_events();
-- drop function if exists public.is_org_member(uuid);
-- drop table if exists public.operations_audit;
-- drop table if exists public.analytics_daily_totals;
-- drop table if exists public.active_sessions;
-- drop table if exists public.ticket_events;
-- drop table if exists public.admin_profiles;
-- drop table if exists public.organization_members;
-- drop table if exists public.organizations;
-- alter table public.tickets drop column if exists organization_id, drop column if exists category;
