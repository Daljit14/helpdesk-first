-- Security remediation B1-B5.
-- Run after schema.sql, cloud-features.sql, operations.sql,
-- admin-dashboard.sql, resolution-tracking.sql, ticket-workflow.sql,
-- user-ticket-portal.sql, wave-1-2-remediation.sql, and notifications-sla.sql.
-- This migration is idempotent. Do not run automatically.

drop policy if exists "Users manage their own tickets" on public.tickets;
drop policy if exists "Users read their own tickets" on public.tickets;
create policy "Users read their own tickets" on public.tickets
  for select to authenticated using (auth.uid() = user_id);

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
        or new.reopen_count is distinct from old.reopen_count
        or new.status is distinct from old.status
        or new.organization_id is distinct from old.organization_id
        or new.priority is distinct from old.priority
        or new.verification_exception is distinct from old.verification_exception
        or new.message is distinct from old.message
        or new.category is distinct from old.category
        or new.issue_id is distinct from old.issue_id
        or new.human_response_due_at is distinct from old.human_response_due_at
        or new.resolution_due_at is distinct from old.resolution_due_at
        or new.overdue_notified_at is distinct from old.overdue_notified_at
        or new.resolution_overdue_notified_at is distinct from old.resolution_overdue_notified_at
        or new.sla_risk_notified_at is distinct from old.sla_risk_notified_at then
        raise exception 'workflow fields are managed by the resolution flow';
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

create or replace function public.tickets_guard_delete()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    raise exception 'tickets cannot be deleted by requesters';
  end if;
  return old;
end;
$$;

drop trigger if exists tickets_guard_delete_trigger on public.tickets;
create trigger tickets_guard_delete_trigger
  before delete on public.tickets
  for each row execute function public.tickets_guard_delete();

update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array[
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/pdf'
    ],
    public = false
where id = 'ticket-attachments';
