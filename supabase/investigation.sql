create table if not exists public.ticket_investigations (
  ticket_id uuid primary key references public.tickets(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  context jsonb not null default '{}'::jsonb,
  hypotheses jsonb not null default '[]'::jsonb,
  excluded_steps jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'escalated', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_investigation_turns (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  decision text not null check (decision in ('match', 'clarify', 'escalate')),
  confidence numeric(4,3),
  matched_issue_slug text check (length(matched_issue_slug) <= 120),
  question_ids jsonb not null default '[]'::jsonb,
  hypotheses jsonb not null default '[]'::jsonb,
  next_steps jsonb not null default '[]'::jsonb,
  withheld_steps jsonb not null default '[]'::jsonb,
  provider text not null check (length(provider) <= 40),
  model text check (length(model) <= 120),
  created_at timestamptz not null default now()
);

create index if not exists ticket_investigations_organization_idx
  on public.ticket_investigations(organization_id);
create index if not exists ticket_investigation_turns_ticket_idx
  on public.ticket_investigation_turns(ticket_id);
create index if not exists ticket_investigation_turns_organization_idx
  on public.ticket_investigation_turns(organization_id);

alter table public.ticket_investigations enable row level security;
alter table public.ticket_investigation_turns enable row level security;

drop policy if exists "Investigation owners read investigations"
  on public.ticket_investigations;
create policy "Investigation owners read investigations"
  on public.ticket_investigations for select
  using (user_id = auth.uid());

drop policy if exists "Organization members read investigations"
  on public.ticket_investigations;
create policy "Organization members read investigations"
  on public.ticket_investigations for select
  using (
    organization_id is not null
    and public.is_org_member(organization_id)
  );

drop policy if exists "Investigation owners read turns"
  on public.ticket_investigation_turns;
create policy "Investigation owners read turns"
  on public.ticket_investigation_turns for select
  using (
    exists (
      select 1
      from public.ticket_investigations investigation
      where investigation.ticket_id = ticket_investigation_turns.ticket_id
        and investigation.user_id = auth.uid()
    )
  );

drop policy if exists "Organization members read turns"
  on public.ticket_investigation_turns;
create policy "Organization members read turns"
  on public.ticket_investigation_turns for select
  using (
    organization_id is not null
    and public.is_org_member(organization_id)
  );

-- Rollback:
-- drop table if exists public.ticket_investigation_turns;
-- drop table if exists public.ticket_investigations;
