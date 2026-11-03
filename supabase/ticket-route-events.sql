-- E6a ticket route events. Additive, idempotent migration.
-- Apply manually after ticket-workflow.sql and wave-3-organizations.sql.
-- Do not run automatically. Writes go through the service role only.

create table if not exists public.ticket_route_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  source text not null check (source in ('claim', 'assign')),
  from_agent_id uuid references auth.users(id),
  to_agent_id uuid references auth.users(id),
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists ticket_route_events_org_time_idx
  on public.ticket_route_events (organization_id, created_at desc);
create index if not exists ticket_route_events_ticket_idx
  on public.ticket_route_events (ticket_id, created_at);

alter table public.ticket_route_events enable row level security;

revoke all on public.ticket_route_events from public, anon, authenticated;
grant select on public.ticket_route_events to authenticated;
grant all on public.ticket_route_events to service_role;

drop policy if exists "Organization members read ticket route events"
  on public.ticket_route_events;
create policy "Organization members read ticket route events"
  on public.ticket_route_events for select
  using (public.is_org_member(organization_id));

-- Rollback (drops routing history; review before running):
-- drop table if exists public.ticket_route_events;
