-- Run after supabase/schema.sql and supabase/cloud-features.sql
-- (Project > SQL Editor > New query).
-- Adds: operations fields on tickets, a privacy-safe analytics_events table,
-- and a traffic snapshot function used by /api/admin/operations/export and
-- the private /admin/operations dashboard.

-- 1) Operations fields on tickets ------------------------------------------
alter table public.tickets
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists priority text not null default 'Normal'
    check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  add column if not exists assigned_agent text,
  add column if not exists platform text
    check (platform is null or platform in ('Windows', 'macOS', 'Linux', 'Android', 'iOS', 'Other')),
  add column if not exists first_response_at timestamptz,
  add column if not exists resolved_at timestamptz;

-- Keep updated_at / first_response_at / resolved_at in sync with status edits
-- made in the Supabase Table Editor.
create or replace function public.tickets_track_lifecycle()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  if new.status is distinct from old.status then
    if new.first_response_at is null and old.status in ('Open', 'New') then
      new.first_response_at := now();
    end if;

    if new.status in ('Resolved', 'Closed') then
      if new.resolved_at is null then
        new.resolved_at := now();
      end if;
    else
      new.resolved_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_track_lifecycle_trigger on public.tickets;
create trigger tickets_track_lifecycle_trigger
  before update on public.tickets
  for each row execute function public.tickets_track_lifecycle();

-- 2) Privacy-safe analytics events ------------------------------------------
-- visitor_key is a random per-browser id from a cookie (not an IP, not a
-- user id). No emails, IPs, user agents, or message bodies are stored.
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null
    check (event_type in ('page_view', 'guide_view', 'assistant_start', 'ticket_created')),
  path text,
  issue_id text,
  visitor_key text not null,
  platform text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at desc);

-- No policies: only the server (service role) may read or write this table.
alter table public.analytics_events enable row level security;

-- 3) Traffic snapshot ---------------------------------------------------------
-- One row shaped like the Excel TrafficTimelineTable. "Per minute" figures are
-- averaged over the last 5 minutes. A session is a run of events from one
-- visitor with no gap longer than 30 minutes.
create or replace function public.operations_traffic_snapshot()
returns table (
  "timestamp" timestamptz,
  active_users_5m int,
  page_views_per_min numeric,
  unique_visitors_today int,
  sessions_today int,
  guide_views_per_min numeric,
  assistant_starts_per_min numeric,
  tickets_created_per_min numeric
)
language sql
security definer
set search_path = public
as $$
  with recent as (
    select * from public.analytics_events
    where created_at >= now() - interval '5 minutes'
  ),
  today as (
    select visitor_key, created_at from public.analytics_events
    where created_at >= date_trunc('day', now())
      and event_type <> 'ticket_created'
  ),
  gaps as (
    select
      visitor_key,
      created_at,
      lag(created_at) over (partition by visitor_key order by created_at) as prev_at
    from today
  )
  select
    now() as "timestamp",
    (select count(distinct visitor_key) from recent where event_type <> 'ticket_created')::int as active_users_5m,
    round((select count(*) from recent where event_type in ('page_view', 'guide_view')) / 5.0, 2) as page_views_per_min,
    (select count(distinct visitor_key) from today)::int as unique_visitors_today,
    (select count(*) from gaps where prev_at is null or created_at - prev_at > interval '30 minutes')::int as sessions_today,
    round((select count(*) from recent where event_type = 'guide_view') / 5.0, 2) as guide_views_per_min,
    round((select count(*) from recent where event_type = 'assistant_start') / 5.0, 2) as assistant_starts_per_min,
    round((select count(*) from recent where event_type = 'ticket_created') / 5.0, 2) as tickets_created_per_min;
$$;

revoke all on function public.operations_traffic_snapshot() from public, anon, authenticated;

-- 4) Housekeeping: keep 30 days of events (run manually or via pg_cron).
-- delete from public.analytics_events where created_at < now() - interval '30 days';
