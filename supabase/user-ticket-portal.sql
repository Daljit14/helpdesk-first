-- Phase 5L requester ticket portal.
-- Run after schema.sql, operations.sql, resolution-tracking.sql, and ticket-workflow.sql.
-- This migration is additive and idempotent. Do not run automatically.

alter table public.tickets
  add column if not exists satisfaction_rating smallint,
  add column if not exists satisfaction_comment text,
  add column if not exists rated_at timestamptz,
  add column if not exists reopen_count integer not null default 0;

alter table public.tickets
  drop constraint if exists tickets_satisfaction_rating_check;
alter table public.tickets
  add constraint tickets_satisfaction_rating_check
  check (satisfaction_rating between 1 and 5);
alter table public.tickets
  drop constraint if exists tickets_satisfaction_comment_check;
alter table public.tickets
  add constraint tickets_satisfaction_comment_check
  check (length(satisfaction_comment) <= 500);

create or replace function public.tickets_guard_resolution_columns()
returns trigger
language plpgsql
as $$
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
        or new.verified_by_user is distinct from old.verified_by_user
        or new.satisfaction_rating is distinct from old.satisfaction_rating
        or new.satisfaction_comment is distinct from old.satisfaction_comment
        or new.rated_at is distinct from old.rated_at
        or new.reopen_count is distinct from old.reopen_count then
        raise exception 'workflow fields are managed by the resolution flow';
      end if;
    end if;
  end if;
  return new;
end;
$$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.ticket_system_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%event_type%'
  loop
    execute format(
      'alter table public.ticket_system_events drop constraint if exists %I',
      constraint_name
    );
  end loop;
end
$$;

alter table public.ticket_system_events
  add constraint ticket_system_events_event_type_check
  check (event_type in (
    'ticket.created', 'ai.assigned', 'ai.solution_offered', 'ai.escalated',
    'employee.assigned', 'employee.claimed', 'comment.created',
    'internal_note.created', 'tool.used', 'status.changed',
    'verification.requested', 'ticket.resolved', 'ticket.closed',
    'ticket.reopened', 'ticket.rated', 'solution.rejected'
  ));

create or replace function public.user_reopen_ticket(ticket uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_ticket public.tickets;
begin
  perform set_config('helpdesk.resolution_rpc', 'on', true);
  select * into current_ticket
  from public.tickets
  where id = ticket and user_id = auth.uid();
  if not found then raise exception 'not found'; end if;
  if lower(current_ticket.status) not in ('resolved', 'closed') then
    raise exception 'not available';
  end if;
  if coalesce(current_ticket.closed_at, current_ticket.resolved_at, current_ticket.updated_at)
    < now() - interval '14 days' then
    raise exception 'reopen window closed';
  end if;

  update public.tickets
  set status = 'Needs Human',
      escalated = true,
      handoff_reason = 'reopened_by_user',
      escalation_reason = left(reason, 1000),
      verified_by_user = false,
      user_confirmed = false,
      user_confirmed_at = null,
      resolution_source = 'unresolved',
      resolver_type = case
        when assigned_agent_id is not null then 'employee'
        else 'unassigned'
      end,
      needs_human_at = now(),
      reopen_count = reopen_count + 1,
      closed_at = null,
      resolved_at = null
  where id = ticket and user_id = auth.uid();
  update public.tickets
  set resolver_type = case
    when assigned_agent_id is not null then 'employee'
    else 'unassigned'
  end
  where id = ticket and user_id = auth.uid();
end;
$$;
revoke all on function public.user_reopen_ticket(uuid, text) from public, anon;
grant execute on function public.user_reopen_ticket(uuid, text) to authenticated;

create or replace function public.user_rate_ticket(
  ticket uuid,
  rating integer,
  comment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('helpdesk.resolution_rpc', 'on', true);
  if not exists (
    select 1 from public.tickets
    where id = ticket
      and user_id = auth.uid()
      and lower(status) in ('resolved', 'closed')
  ) then
    raise exception 'not available';
  end if;
  if rating is null or rating < 1 or rating > 5 then
    raise exception 'invalid rating';
  end if;
  update public.tickets
  set satisfaction_rating = rating,
      satisfaction_comment = nullif(left(comment, 500), ''),
      rated_at = now()
  where id = ticket and user_id = auth.uid();
end;
$$;
revoke all on function public.user_rate_ticket(uuid, integer, text) from public, anon;
grant execute on function public.user_rate_ticket(uuid, integer, text) to authenticated;

create or replace function public.admin_workflow_metrics(org uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
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
  'unassignedNeedsHuman', count(*) filter (where lower(status) = 'needs human' and assigned_agent_id is null),
  'avgSatisfaction', round(avg(satisfaction_rating), 1),
  'reopenedCount', count(*) filter (where reopen_count > 0)
) from scoped;
$$;
revoke all on function public.admin_workflow_metrics(uuid) from public, anon, authenticated;
grant execute on function public.admin_workflow_metrics(uuid) to service_role;

-- Optional destructive rollback; run only with approval:
-- drop function if exists public.user_reopen_ticket(uuid, text);
-- drop function if exists public.user_rate_ticket(uuid, integer, text);
-- alter table public.tickets drop constraint if exists tickets_satisfaction_rating_check;
-- alter table public.tickets drop constraint if exists tickets_satisfaction_comment_check;
-- alter table public.tickets drop column if exists satisfaction_rating;
-- alter table public.tickets drop column if exists satisfaction_comment;
-- alter table public.tickets drop column if exists rated_at;
-- alter table public.tickets drop column if exists reopen_count;
