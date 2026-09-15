-- apply after merge
alter table public.approval_requests
  add column if not exists ticket_id uuid references public.tickets(id) on delete cascade,
  add column if not exists capability_id text,
  add column if not exists capability_version integer,
  add column if not exists parameter_hash text,
  add column if not exists risk_level text,
  add column if not exists nonce text,
  add column if not exists decided_by_user_id uuid,
  add column if not exists consumed_at timestamptz;

create unique index if not exists approval_requests_nonce_idx
  on public.approval_requests(nonce) where nonce is not null;

alter table public.ai_kill_switches drop constraint if exists ai_kill_switches_scope_check;
alter table public.ai_kill_switches
  add constraint ai_kill_switches_scope_check
  check (scope in ('global', 'organization', 'capability', 'provider'));

create or replace function public.tickets_guard_ai_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  autonomy_run record;
begin
  if new.status = 'Resolved' and old.status is distinct from new.status then
    select r.id, r.organization_id
      into autonomy_run
      from public.resolution_runs r
     where r.ticket_id = new.id
       and r.organization_id = new.organization_id
       and r.status not in ('escalated', 'failed')
     order by r.created_at desc
     limit 1;
    if autonomy_run.id is not null and not exists (
      select 1
        from public.verification_results v
       where v.run_id = autonomy_run.id
         and v.organization_id = autonomy_run.organization_id
         and v.outcome = 'passed'
    ) then
      raise exception 'ai_resolution_requires_verification';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tickets_guard_ai_resolution_trigger on public.tickets;
create trigger tickets_guard_ai_resolution_trigger
before update of status on public.tickets
for each row execute function public.tickets_guard_ai_resolution();
