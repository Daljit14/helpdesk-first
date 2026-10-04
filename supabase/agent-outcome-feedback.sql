-- Additive, idempotent migration. Depends on supabase/requester-agent.sql and supabase/wave-3-organizations.sql.

create table if not exists public.agent_outcome_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  verdict text not null check (verdict in ('still_broken','came_back','wrong_problem','other')),
  free_text text,
  redaction_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists agent_outcome_feedback_org_created_idx
  on public.agent_outcome_feedback(organization_id, created_at desc);

alter table public.agent_outcome_feedback enable row level security;

drop policy if exists agent_outcome_feedback_requester_insert
  on public.agent_outcome_feedback;
create policy agent_outcome_feedback_requester_insert
  on public.agent_outcome_feedback for insert to authenticated
  with check (
    user_id = auth.uid() and exists (
      select 1 from public.agent_sessions s
      where s.id = agent_outcome_feedback.session_id
        and s.requester_id = auth.uid()
        and s.organization_id = agent_outcome_feedback.organization_id
    )
  );

drop policy if exists agent_outcome_feedback_requester_read
  on public.agent_outcome_feedback;
create policy agent_outcome_feedback_requester_read
  on public.agent_outcome_feedback for select to authenticated
  using (user_id = auth.uid());

drop policy if exists agent_outcome_feedback_staff_read
  on public.agent_outcome_feedback;
create policy agent_outcome_feedback_staff_read
  on public.agent_outcome_feedback for select to authenticated
  using (public.is_org_staff(organization_id));

drop policy if exists agent_outcome_feedback_service
  on public.agent_outcome_feedback;
create policy agent_outcome_feedback_service
  on public.agent_outcome_feedback for all to service_role
  using (true) with check (true);

revoke update, delete on public.agent_outcome_feedback from anon, authenticated;
revoke all on public.agent_outcome_feedback from anon;
grant select, insert on public.agent_outcome_feedback to authenticated;
grant all on public.agent_outcome_feedback to service_role;
