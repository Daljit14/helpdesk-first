create table if not exists public.shadow_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null references public.resolution_runs(id),
  ticket_id uuid not null references public.tickets(id),
  plan jsonb not null,
  planner text not null,
  planner_version text not null,
  planner_provider text not null,
  policy_decision text,
  policy_reasons jsonb not null default '[]'::jsonb,
  would_execute_capability_id text,
  would_execute_capability_version integer,
  input_blocked boolean not null default false,
  output_rejected boolean not null default false,
  rejection_reason text,
  versions jsonb not null,
  latency_ms integer,
  cost_cents integer not null default 0,
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'agree', 'disagree', 'unsafe')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index if not exists shadow_decisions_org_date_idx
  on public.shadow_decisions (organization_id, created_at desc);
create index if not exists shadow_decisions_org_status_idx
  on public.shadow_decisions (organization_id, review_status);

alter table public.shadow_decisions enable row level security;
create policy shadow_decisions_staff_read on public.shadow_decisions
  for select using (public.is_org_staff(organization_id));

create or replace function public.shadow_decisions_review_only()
returns trigger language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.run_id is distinct from old.run_id
    or new.ticket_id is distinct from old.ticket_id
    or new.plan is distinct from old.plan
    or new.planner is distinct from old.planner
    or new.planner_version is distinct from old.planner_version
    or new.planner_provider is distinct from old.planner_provider
    or new.policy_decision is distinct from old.policy_decision
    or new.policy_reasons is distinct from old.policy_reasons
    or new.would_execute_capability_id is distinct from old.would_execute_capability_id
    or new.would_execute_capability_version is distinct from old.would_execute_capability_version
    or new.input_blocked is distinct from old.input_blocked
    or new.output_rejected is distinct from old.output_rejected
    or new.rejection_reason is distinct from old.rejection_reason
    or new.versions is distinct from old.versions
    or new.latency_ms is distinct from old.latency_ms
    or new.cost_cents is distinct from old.cost_cents
    or new.created_at is distinct from old.created_at then
    raise exception 'shadow_decisions are append-only except review columns';
  end if;
  return new;
end;
$$;

drop trigger if exists shadow_decisions_review_only on public.shadow_decisions;
create trigger shadow_decisions_review_only
before update on public.shadow_decisions
for each row execute function public.shadow_decisions_review_only();
