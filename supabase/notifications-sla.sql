-- Wave 7 notifications outbox and SLA policy. Run after the existing
-- organization, operations, and ticket workflow migrations.
-- Additive and idempotent. Do not run automatically.

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  event_type text not null,
  channel text not null check (channel in ('email', 'push')),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null unique,
  subject text not null,
  body text not null,
  url text,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'dead')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_outbox_dispatch_idx
  on public.notification_outbox(status, next_attempt_at);
alter table public.notification_outbox enable row level security;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
drop policy if exists "Users read own notification preferences"
  on public.notification_preferences;
create policy "Users read own notification preferences"
  on public.notification_preferences for select using (user_id = auth.uid());
drop policy if exists "Users manage own notification preferences"
  on public.notification_preferences;
create policy "Users manage own notification preferences"
  on public.notification_preferences for insert
  with check (user_id = auth.uid());
drop policy if exists "Users update own notification preferences"
  on public.notification_preferences;
create policy "Users update own notification preferences"
  on public.notification_preferences for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.tickets
  add column if not exists resolution_due_at timestamptz,
  add column if not exists sla_risk_notified_at timestamptz,
  add column if not exists resolution_overdue_notified_at timestamptz;

alter table public.organization_policies
  add column if not exists sla_targets jsonb not null default
    '{"first_response":{"Urgent":5,"High":10,"Normal":60,"Low":480},"resolution":{"Urgent":240,"High":480,"Normal":1440,"Low":4320}}'::jsonb,
  add column if not exists timezone text not null default 'America/New_York';

create or replace function public.tickets_track_lifecycle()
returns trigger language plpgsql as $$
declare
  targets jsonb;
  resolution_minutes integer;
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
  if new.human_response_due_at is distinct from old.human_response_due_at
    and new.human_response_due_at is not null then
    select coalesce(sla_targets, '{}'::jsonb) into targets
      from public.organization_policies
      where organization_id = new.organization_id;
    resolution_minutes := coalesce(
      (targets -> 'resolution' ->> new.priority)::integer,
      case lower(new.priority)
        when 'urgent' then 240
        when 'high' then 480
        when 'low' then 4320
        else 1440
      end
    );
    new.resolution_due_at := new.human_response_due_at
      + make_interval(mins => resolution_minutes);
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

-- Optional minute-level dispatch for installations with pg_cron and pg_net.
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'helpdesk-notifications-dispatch',
--   '* * * * *',
--   $job$select net.http_get(
--     url := 'https://YOUR_APP/api/cron/notifications-dispatch',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
--     )
--   )$job$
-- );

-- Rollback (run only with approval):
-- drop table if exists public.notification_outbox;
-- drop table if exists public.notification_preferences;
-- alter table public.tickets drop column if exists resolution_due_at;
-- alter table public.tickets drop column if exists sla_risk_notified_at;
-- alter table public.tickets drop column if exists resolution_overdue_notified_at;
-- alter table public.organization_policies drop column if exists sla_targets;
-- alter table public.organization_policies drop column if exists timezone;
