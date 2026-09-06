-- Run after schema.sql, cloud-features.sql, operations.sql,
-- resolution-tracking.sql, and admin-dashboard.sql.
-- This migration is additive and idempotent. Do not run automatically.

alter table public.tickets
  add column if not exists resolver_type text not null default 'unassigned',
  add column if not exists ai_confidence numeric(5,2),
  add column if not exists ai_risk_level text,
  add column if not exists ai_failed_attempts integer not null default 0,
  add column if not exists ai_question_count integer not null default 0,
  add column if not exists needs_human_at timestamptz,
  add column if not exists handoff_reason text,
  add column if not exists assigned_agent_id uuid references auth.users(id),
  add column if not exists assigned_at timestamptz,
  add column if not exists first_human_response_at timestamptz,
  add column if not exists human_response_due_at timestamptz,
  add column if not exists overdue_notified_at timestamptz,
  add column if not exists verification_requested_at timestamptz,
  add column if not exists verification_method text,
  add column if not exists verified_by_user boolean not null default false,
  add column if not exists resolution_report jsonb,
  add column if not exists closed_at timestamptz,
  add column if not exists diagnostic_answers jsonb not null default '[]'::jsonb;

alter table public.tickets drop constraint if exists tickets_resolver_type_check;
alter table public.tickets add constraint tickets_resolver_type_check
  check (resolver_type in ('ai', 'employee', 'unassigned'));
alter table public.tickets drop constraint if exists tickets_ai_risk_level_check;
alter table public.tickets add constraint tickets_ai_risk_level_check
  check (ai_risk_level is null or ai_risk_level in ('low', 'medium', 'high'));
alter table public.tickets drop constraint if exists tickets_resolution_source_check;
alter table public.tickets drop constraint if exists tickets_ai_requires_confirmation;
alter table public.tickets add constraint tickets_resolution_source_check
  check (resolution_source is null or resolution_source in ('ai', 'agent', 'employee', 'self_service', 'unresolved'));
alter table public.tickets add constraint tickets_ai_requires_confirmation
  check (resolution_source is distinct from 'ai' or user_confirmed);
alter table public.tickets drop constraint if exists tickets_workflow_status_check;
alter table public.tickets add constraint tickets_workflow_status_check
  check (status in ('Open', 'New', 'AI Reviewing', 'AI Resolving', 'Needs Human',
    'In Progress', 'Waiting', 'Waiting for User', 'Pending Verification',
    'Resolved', 'Closed')) not valid;
alter table public.tickets drop constraint if exists tickets_employee_resolution_confirmation;
alter table public.tickets add constraint tickets_employee_resolution_confirmation
  check (not (lower(status) = 'resolved' and resolution_source = 'employee' and not verified_by_user))
  not valid;

create index if not exists tickets_org_status_workflow_idx
  on public.tickets (organization_id, status);
create index if not exists tickets_org_assigned_agent_idx
  on public.tickets (organization_id, assigned_agent_id);
create index if not exists tickets_org_needs_human_idx
  on public.tickets (organization_id, needs_human_at)
  where needs_human_at is not null;

create or replace function public.tickets_track_lifecycle()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    if new.first_response_at is null and lower(old.status) in ('open', 'new') then
      new.first_response_at := now();
    end if;
    if new.first_human_response_at is null and lower(new.status) = 'in progress'
      and new.assigned_agent_id is not null then
      new.first_human_response_at := coalesce(new.first_human_response_at, now());
    end if;
    if lower(new.status) = 'needs human' then
      new.needs_human_at := coalesce(new.needs_human_at, now());
      new.escalated := true;
      new.resolver_type := 'unassigned';
    elsif lower(new.status) = 'pending verification' then
      new.verification_requested_at := coalesce(new.verification_requested_at, now());
    elsif lower(new.status) = 'resolved' then
      new.resolved_at := coalesce(new.resolved_at, now());
      if new.resolver_type = 'employee' and new.verified_by_user then
        new.resolution_source := 'employee';
      end if;
    elsif lower(new.status) = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
    elsif lower(old.status) in ('resolved', 'closed') then
      new.resolved_at := null;
      new.closed_at := null;
      new.resolution_source := null;
      new.verified_by_user := false;
    end if;
  end if;
  if new.escalated and not old.escalated then
    new.escalated_at := coalesce(new.escalated_at, now());
  end if;
  if new.user_confirmed and not old.user_confirmed then
    new.user_confirmed_at := coalesce(new.user_confirmed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_track_lifecycle_trigger on public.tickets;
create trigger tickets_track_lifecycle_trigger before update on public.tickets
for each row execute function public.tickets_track_lifecycle();
drop trigger if exists tickets_track_resolution_trigger on public.tickets;

create or replace function public.tickets_guard_resolution_columns()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated'
    and coalesce(current_setting('helpdesk.resolution_rpc', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      if new.resolution_source is not null or new.user_confirmed
        or new.user_confirmed_at is not null or new.resolver_type <> 'unassigned'
        or new.ai_confidence is not null or new.ai_risk_level is not null
        or new.ai_attempted or new.needs_human_at is not null
        or new.assigned_agent_id is not null or new.resolution_report is not null then
        raise exception 'workflow fields are managed by the resolution flow';
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
        or new.resolution_summary is distinct from old.resolution_summary
        or new.resolver_type is distinct from old.resolver_type
        or new.ai_confidence is distinct from old.ai_confidence
        or new.ai_risk_level is distinct from old.ai_risk_level
        or new.ai_failed_attempts is distinct from old.ai_failed_attempts
        or new.needs_human_at is distinct from old.needs_human_at
        or new.handoff_reason is distinct from old.handoff_reason
        or new.assigned_agent_id is distinct from old.assigned_agent_id
        or new.assigned_at is distinct from old.assigned_at
        or new.resolution_report is distinct from old.resolution_report
        or new.verified_by_user is distinct from old.verified_by_user then
        raise exception 'workflow fields are managed by the resolution flow';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_guard_resolution_columns_trigger on public.tickets;
create trigger tickets_guard_resolution_columns_trigger before insert or update on public.tickets
for each row execute function public.tickets_guard_resolution_columns();

create table if not exists public.ticket_comments (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references auth.users(id),
  author_type text not null check (author_type in ('user', 'ai', 'employee', 'system')),
  visibility text not null check (visibility in ('public', 'internal')),
  message text not null check (length(message) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ticket_comments_ticket_created_idx
  on public.ticket_comments(ticket_id, created_at);
alter table public.ticket_comments enable row level security;
drop policy if exists "Ticket owners read public comments" on public.ticket_comments;
create policy "Ticket owners read public comments" on public.ticket_comments for select
using (visibility = 'public' and exists (
  select 1 from public.tickets t where t.id = ticket_id and t.user_id = auth.uid()
));
drop policy if exists "Ticket owners add public comments" on public.ticket_comments;
create policy "Ticket owners add public comments" on public.ticket_comments for insert
with check (author_type = 'user' and visibility = 'public' and author_id = auth.uid()
  and exists (select 1 from public.tickets t where t.id = ticket_id and t.user_id = auth.uid()));
drop policy if exists "Organization members read comments" on public.ticket_comments;
create policy "Organization members read comments" on public.ticket_comments for select
using (public.is_org_member(organization_id));

create table if not exists public.ticket_actions (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid references auth.users(id),
  tool_name text not null check (length(tool_name) <= 120),
  action_summary text not null check (length(action_summary) <= 1000),
  result_summary text not null check (length(result_summary) <= 1000),
  consent_required boolean not null default false,
  consent_received boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.ticket_actions enable row level security;
drop policy if exists "Organization members read actions" on public.ticket_actions;
create policy "Organization members read actions" on public.ticket_actions for select
using (public.is_org_member(organization_id));

create table if not exists public.ticket_system_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in (
    'ticket.created', 'ai.assigned', 'ai.solution_offered', 'ai.escalated',
    'employee.assigned', 'employee.claimed', 'comment.created',
    'internal_note.created', 'tool.used', 'status.changed',
    'verification.requested', 'ticket.resolved', 'ticket.closed',
    'ticket.reopened'
  )),
  actor_type text not null check (actor_type in ('user', 'ai', 'employee', 'system')),
  actor_id uuid references auth.users(id),
  detail jsonb,
  created_at timestamptz not null default now()
);
alter table public.ticket_system_events enable row level security;
drop policy if exists "Organization members read system events" on public.ticket_system_events;
create policy "Organization members read system events" on public.ticket_system_events
for select using (public.is_org_member(organization_id));
drop policy if exists "Ticket owners read non-internal events" on public.ticket_system_events;
create policy "Ticket owners read non-internal events" on public.ticket_system_events
for select using (
  event_type not in ('internal_note.created', 'tool.used') and exists (
    select 1 from public.tickets t where t.id = ticket_id and t.user_id = auth.uid()
  )
);
create or replace function public.ticket_system_events_immutable()
returns trigger language plpgsql as $$
begin raise exception 'ticket_system_events are immutable'; end;
$$;
drop trigger if exists ticket_system_events_immutable_trigger on public.ticket_system_events;
create trigger ticket_system_events_immutable_trigger before update or delete
on public.ticket_system_events for each row execute function public.ticket_system_events_immutable();

do $$ begin
  alter publication supabase_realtime add table public.ticket_comments;
exception when duplicate_object then null;
end $$;

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
    select * from scoped where lower(status) in (
      'open', 'new', 'in progress', 'in_progress', 'waiting',
      'ai reviewing', 'ai resolving', 'needs human',
      'waiting for user', 'pending verification'
    )
  ),
  completed as (
    select * from scoped where lower(status) in ('resolved', 'closed')
  ),
  workload as (
    select
      coalesce(assigned_agent, 'Unassigned') as agent,
      count(*) filter (where lower(status) in (
        'open', 'new', 'in progress', 'in_progress', 'waiting',
        'ai reviewing', 'ai resolving', 'needs human',
        'waiting for user', 'pending verification'
      )) as open,
      count(*) filter (where lower(priority) = 'urgent' and lower(status) in (
        'open', 'new', 'in progress', 'in_progress', 'waiting',
        'ai reviewing', 'ai resolving', 'needs human',
        'waiting for user', 'pending verification'
      )) as urgent,
      count(*) filter (where lower(status) in (
        'open', 'new', 'in progress', 'in_progress', 'waiting',
        'ai reviewing', 'ai resolving', 'needs human',
        'waiting for user', 'pending verification'
      ) and created_at + case lower(priority)
        when 'urgent' then interval '4 hours'
        when 'high' then interval '8 hours'
        when 'low' then interval '72 hours'
        else interval '24 hours' end < now()) as breached,
      count(*) filter (where lower(status) in ('waiting', 'waiting for user')) as waiting,
      count(*) filter (where lower(status) in ('resolved', 'closed')
        and resolved_at >= date_trunc('day', now())) as resolved_today
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
    'waitingTickets', (select count(*) from open_tickets where lower(status) in ('waiting', 'waiting for user')),
    'urgentOpenTickets', (select count(*) from open_tickets where lower(priority) = 'urgent'),
    'completedToday', (select count(*) from completed where resolved_at >= date_trunc('day', now())),
    'totalCompleted', (select count(*) from completed),
    'slaBreached', (select count(*) from open_tickets where human_response_due_at is not null and human_response_due_at < now()),
    'avgFirstResponseMinutes', (select coalesce(avg(extract(epoch from (first_response_at - created_at)) / 60), 0) from scoped where first_response_at is not null and first_response_at >= now() - interval '30 days'),
    'avgResolutionMinutes', (select coalesce(avg(extract(epoch from (resolved_at - created_at)) / 60), 0) from completed where resolved_at is not null and resolved_at >= now() - interval '30 days'),
    'ticketsByCategory', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'count', count)) from (select coalesce(category, 'Other') key, count(*)::int count from scoped group by coalesce(category, 'Other') order by count desc) x), '[]'::jsonb),
    'ticketsByPlatform', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'count', count)) from (select coalesce(platform, 'Other') key, count(*)::int count from scoped group by coalesce(platform, 'Other') order by count desc) x), '[]'::jsonb),
    'agentWorkload', coalesce((select jsonb_agg(jsonb_build_object('agent', agent, 'open', open, 'urgent', urgent, 'breached', breached, 'waiting', waiting, 'resolvedToday', resolved_today)) from workload), '[]'::jsonb)
  );
$$;
revoke all on function public.admin_operations_metrics(uuid) from public, anon, authenticated;
grant execute on function public.admin_operations_metrics(uuid) to service_role;

create or replace function public.admin_workflow_metrics(org uuid)
returns jsonb language sql security definer stable set search_path = public as $$
with scoped as (select * from public.tickets where organization_id = org)
select jsonb_build_object(
  'needsHuman', count(*) filter (where lower(status) = 'needs human'),
  'aiResolving', count(*) filter (where lower(status) = 'ai resolving'),
  'inProgress', count(*) filter (where lower(status) = 'in progress'),
  'waitingForUser', count(*) filter (where lower(status) = 'waiting for user'),
  'pendingVerification', count(*) filter (where lower(status) = 'pending verification'),
  'slaAtRisk', count(*) filter (where first_human_response_at is null and human_response_due_at is not null and human_response_due_at <= now() + interval '10 minutes'),
  'slaBreached', count(*) filter (where first_human_response_at is null and human_response_due_at is not null and human_response_due_at < now()),
  'resolvedByAi', count(*) filter (where resolution_source = 'ai'),
  'resolvedByEmployees', count(*) filter (where resolution_source in ('agent', 'employee')),
  'unassignedNeedsHuman', count(*) filter (where lower(status) = 'needs human' and assigned_agent_id is null)
) from scoped;
$$;
revoke all on function public.admin_workflow_metrics(uuid) from public, anon, authenticated;
grant execute on function public.admin_workflow_metrics(uuid) to service_role;

create or replace function public.user_verify_ticket(ticket uuid, confirmed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare current_ticket public.tickets;
begin
  perform set_config('helpdesk.resolution_rpc', 'on', true);
  select * into current_ticket from public.tickets where id = ticket and user_id = auth.uid();
  if not found then raise exception 'not found'; end if;
  if lower(current_ticket.status) <> 'pending verification' then
    raise exception 'verification is not available';
  end if;
  if confirmed then
    update public.tickets set verified_by_user = true, user_confirmed = true, user_confirmed_at = now(), status = 'Resolved'
    where id = ticket and user_id = auth.uid();
  elsif current_ticket.resolver_type = 'employee' then
    update public.tickets set status = 'Needs Human', handoff_reason = 'user_requested_human'
    where id = ticket and user_id = auth.uid();
  else
    update public.tickets set ai_failed_attempts = ai_failed_attempts + 1,
      status = case when ai_failed_attempts + 1 >= 2 then 'Needs Human' else 'AI Resolving' end
    where id = ticket and user_id = auth.uid();
  end if;
end;
$$;
revoke all on function public.user_verify_ticket(uuid, boolean) from public, anon;
grant execute on function public.user_verify_ticket(uuid, boolean) to authenticated;

create or replace function public.handoff_ticket(ticket uuid, reason text, handoff text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('helpdesk.resolution_rpc', 'on', true);
  update public.tickets set status = 'Needs Human', escalated = true,
    handoff_reason = left(handoff, 500), escalation_reason = left(reason, 1000)
  where id = ticket and user_id = auth.uid();
  if not found then raise exception 'not found'; end if;
end;
$$;
revoke all on function public.handoff_ticket(uuid, text, text) from public, anon;
grant execute on function public.handoff_ticket(uuid, text, text) to authenticated;

create or replace function public.record_ai_attempt_failed(ticket uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('helpdesk.resolution_rpc', 'on', true);
  update public.tickets set ai_failed_attempts = ai_failed_attempts + 1,
    status = case when ai_failed_attempts + 1 >= 2 then 'Needs Human' else 'AI Resolving' end,
    handoff_reason = case when ai_failed_attempts + 1 >= 2 then 'repeated_failure' else handoff_reason end
  where id = ticket and user_id = auth.uid();
  if not found then raise exception 'not found'; end if;
end;
$$;
revoke all on function public.record_ai_attempt_failed(uuid) from public, anon;
grant execute on function public.record_ai_attempt_failed(uuid) to authenticated;

-- Optional destructive rollback; run only with approval:
-- drop trigger if exists ticket_system_events_immutable_trigger on public.ticket_system_events;
-- drop trigger if exists tickets_guard_resolution_columns_trigger on public.tickets;
-- drop trigger if exists tickets_track_lifecycle_trigger on public.tickets;
-- drop function if exists public.record_ai_attempt_failed(uuid);
-- drop function if exists public.handoff_ticket(uuid, text, text);
-- drop function if exists public.user_verify_ticket(uuid, boolean);
-- drop function if exists public.admin_workflow_metrics(uuid);
-- drop table if exists public.ticket_system_events;
-- drop table if exists public.ticket_actions;
-- drop table if exists public.ticket_comments;
-- alter table public.tickets drop constraint if exists tickets_employee_resolution_confirmation;
-- alter table public.tickets drop constraint if exists tickets_workflow_status_check;
-- alter table public.tickets drop constraint if exists tickets_ai_requires_confirmation;
-- alter table public.tickets drop constraint if exists tickets_resolution_source_check;
-- alter table public.tickets drop constraint if exists tickets_ai_risk_level_check;
-- alter table public.tickets drop constraint if exists tickets_resolver_type_check;
-- alter table public.tickets drop column if exists resolver_type;
-- alter table public.tickets drop column if exists ai_confidence;
-- alter table public.tickets drop column if exists ai_risk_level;
-- alter table public.tickets drop column if exists ai_failed_attempts;
-- alter table public.tickets drop column if exists ai_question_count;
-- alter table public.tickets drop column if exists needs_human_at;
-- alter table public.tickets drop column if exists handoff_reason;
-- alter table public.tickets drop column if exists assigned_agent_id;
-- alter table public.tickets drop column if exists assigned_at;
-- alter table public.tickets drop column if exists first_human_response_at;
-- alter table public.tickets drop column if exists human_response_due_at;
-- alter table public.tickets drop column if exists overdue_notified_at;
-- alter table public.tickets drop column if exists verification_requested_at;
-- alter table public.tickets drop column if exists verification_method;
-- alter table public.tickets drop column if exists verified_by_user;
-- alter table public.tickets drop column if exists resolution_report;
-- alter table public.tickets drop column if exists closed_at;
-- alter table public.tickets drop column if exists diagnostic_answers;
