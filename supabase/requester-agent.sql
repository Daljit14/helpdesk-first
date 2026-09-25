create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requester_id uuid not null,
  status text not null default 'active' check (status in ('active','resolved','escalated','abandoned','halted')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_user_message text,
  resolution_summary text,
  escalation_ticket_id uuid references public.tickets(id) on delete set null,
  backing_ticket_id uuid references public.tickets(id) on delete set null,
  resolution_run_id uuid references public.resolution_runs(id) on delete set null,
  pending_approval_id uuid references public.approval_requests(id) on delete set null,
  action_count integer not null default 0,
  failed_hypotheses integer not null default 0,
  tool_call_count integer not null default 0,
  model_turn_count integer not null default 0,
  token_count integer not null default 0,
  halt_reason text,
  security_flag boolean not null default false,
  verified_execution_id uuid,
  user_confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  seq integer not null,
  kind text not null check (kind in ('user_message','thinking_summary','tool_started','tool_result','tool_rejected','final','claim_stripped','escalated','halted','error','action_proposed','consent_required','consent_decided','consent_declined','action_executing','verification_result','rollback_result','confirm_required','user_feedback','resolved','security_incident','action_rejected')),
  tool_name text,
  capability_id text,
  params_hash text,
  policy_decision text,
  consent_id uuid,
  result_summary text,
  verification_status text,
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

create index if not exists agent_sessions_organization_started_idx
  on public.agent_sessions(organization_id, started_at desc);
create index if not exists agent_sessions_requester_started_idx
  on public.agent_sessions(requester_id, started_at desc);
create index if not exists agent_steps_session_seq_idx
  on public.agent_steps(session_id, seq);

alter table public.agent_sessions add column if not exists backing_ticket_id uuid references public.tickets(id) on delete set null;
alter table public.agent_sessions add column if not exists resolution_run_id uuid references public.resolution_runs(id) on delete set null;
alter table public.agent_sessions add column if not exists pending_approval_id uuid references public.approval_requests(id) on delete set null;
alter table public.agent_sessions add column if not exists failed_hypotheses integer not null default 0;
alter table public.agent_sessions add column if not exists verified_execution_id uuid;
alter table public.agent_sessions add column if not exists user_confirmed_at timestamptz;

alter table public.agent_steps drop constraint if exists agent_steps_kind_check;
alter table public.agent_steps add constraint agent_steps_kind_check check (kind in ('user_message','thinking_summary','tool_started','tool_result','tool_rejected','final','claim_stripped','escalated','halted','error','action_proposed','consent_required','consent_decided','consent_declined','action_executing','verification_result','rollback_result','confirm_required','user_feedback','resolved','security_incident','action_rejected'));

alter table public.agent_sessions enable row level security;
alter table public.agent_steps enable row level security;

drop policy if exists agent_sessions_requester_read on public.agent_sessions;
create policy agent_sessions_requester_read on public.agent_sessions
  for select to authenticated using (requester_id = auth.uid());
drop policy if exists agent_sessions_staff_read on public.agent_sessions;
create policy agent_sessions_staff_read on public.agent_sessions
  for select to authenticated using (public.is_org_staff(organization_id));
drop policy if exists agent_sessions_service on public.agent_sessions;
create policy agent_sessions_service on public.agent_sessions
  for all to service_role using (true) with check (true);

drop policy if exists agent_steps_requester_read on public.agent_steps;
create policy agent_steps_requester_read on public.agent_steps
  for select to authenticated using (
    exists (
      select 1 from public.agent_sessions s
      where s.id = agent_steps.session_id and s.requester_id = auth.uid()
    )
  );
drop policy if exists agent_steps_staff_read on public.agent_steps;
create policy agent_steps_staff_read on public.agent_steps
  for select to authenticated using (public.is_org_staff(organization_id));
drop policy if exists agent_steps_service on public.agent_steps;
create policy agent_steps_service on public.agent_steps
  for all to service_role using (true) with check (true);

revoke all on public.agent_sessions, public.agent_steps from anon, authenticated;
grant select on public.agent_sessions, public.agent_steps to authenticated;
grant all on public.agent_sessions, public.agent_steps to service_role;

create or replace function public.agent_steps_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'agent steps are append-only';
end $$;
drop trigger if exists agent_steps_immutable on public.agent_steps;
create trigger agent_steps_immutable
before update or delete on public.agent_steps
for each row execute function public.agent_steps_immutable();

create or replace function public.agent_sessions_terminal_immutable()
returns trigger language plpgsql as $$
begin
  if old.status in ('resolved','escalated','abandoned','halted') then
    raise exception 'terminal agent sessions are immutable';
  end if;
  return new;
end $$;
drop trigger if exists agent_sessions_terminal_immutable on public.agent_sessions;
create trigger agent_sessions_terminal_immutable
before update on public.agent_sessions
for each row execute function public.agent_sessions_terminal_immutable();
