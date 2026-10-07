create table if not exists public.answer_source_cache (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('brave', 'tavily', 'wikipedia', 'stackexchange', 'page')),
  cache_key text not null check (cache_key ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (provider, cache_key)
);

create table if not exists public.answer_cache (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope = 'public' or scope ~ '^org:[0-9a-f-]{36}$'),
  organization_id uuid references public.organizations(id) on delete cascade,
  problem_hash text not null check (problem_hash ~ '^[a-f0-9]{64}$'),
  answer jsonb not null,
  sources jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  unique (scope, problem_hash),
  check (
    (organization_id is null and scope = 'public') or
    (organization_id is not null and scope = 'org:' || organization_id::text)
  )
);

create table if not exists public.answer_engine_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  agent_session_id uuid references public.agent_sessions(id) on delete restrict,
  ticket_id uuid references public.tickets(id) on delete restrict,
  scope text not null check (scope = 'public' or scope ~ '^org:[0-9a-f-]{36}$'),
  problem_label text not null default '' check (length(problem_label) <= 120),
  platform text not null default '' check (length(platform) <= 40),
  status text not null check (status in (
    'disabled', 'input_blocked', 'no_sources', 'unavailable',
    'low_confidence', 'answered'
  )),
  confidence numeric(3, 2) not null default 0 check (confidence between 0 and 1),
  top_tier text check (top_tier in (
    'org_approved', 'vendor', 'reference', 'qa_community', 'community'
  )),
  providers jsonb not null default '[]'::jsonb,
  queries integer not null default 0 check (queries >= 0),
  sources integer not null default 0 check (sources >= 0),
  cited_sources integer not null default 0 check (cited_sources >= 0),
  dropped_claims integer not null default 0 check (dropped_claims >= 0),
  withheld_paragraphs integer not null default 0 check (withheld_paragraphs >= 0),
  cache_hit boolean not null default false,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  cost_units integer not null default 0 check (cost_units >= 0),
  prompt_version text not null,
  created_at timestamptz not null default now(),
  check (
    (organization_id is null and scope = 'public') or
    (organization_id is not null and scope = 'org:' || organization_id::text)
  )
);

create index if not exists answer_engine_runs_organization_created_idx
  on public.answer_engine_runs(organization_id, created_at desc);
create index if not exists answer_engine_runs_status_created_idx
  on public.answer_engine_runs(status, created_at desc);

create table if not exists public.answer_engine_feedback (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.answer_engine_runs(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  outcome text not null check (outcome in ('helpful', 'not_helpful', 'fixed')),
  created_at timestamptz not null default now(),
  unique (run_id)
);

create index if not exists answer_engine_feedback_organization_created_idx
  on public.answer_engine_feedback(organization_id, created_at desc);

create table if not exists public.answer_engine_usage (
  day date not null,
  scope text not null check (scope = 'global' or scope ~ '^org:[0-9a-f-]{36}$'),
  units integer not null default 0 check (units >= 0),
  primary key (day, scope)
);

alter table public.answer_source_cache enable row level security;
alter table public.answer_cache enable row level security;
alter table public.answer_engine_runs enable row level security;
alter table public.answer_engine_feedback enable row level security;
alter table public.answer_engine_usage enable row level security;

revoke all on table public.answer_source_cache, public.answer_cache,
  public.answer_engine_runs, public.answer_engine_feedback,
  public.answer_engine_usage from public, anon, authenticated;
grant all on table public.answer_source_cache, public.answer_cache,
  public.answer_engine_runs, public.answer_engine_feedback,
  public.answer_engine_usage to service_role;
grant select on table public.answer_cache, public.answer_engine_runs,
  public.answer_engine_feedback to authenticated;

drop policy if exists answer_source_cache_service_role on public.answer_source_cache;
create policy answer_source_cache_service_role on public.answer_source_cache
  for all to service_role using (true) with check (true);

drop policy if exists answer_cache_service_role on public.answer_cache;
create policy answer_cache_service_role on public.answer_cache
  for all to service_role using (true) with check (true);
drop policy if exists answer_cache_staff_read on public.answer_cache;
create policy answer_cache_staff_read on public.answer_cache
  for select to authenticated using (
    organization_id is not null and public.is_org_staff(organization_id)
  );

drop policy if exists answer_engine_runs_service_role on public.answer_engine_runs;
create policy answer_engine_runs_service_role on public.answer_engine_runs
  for all to service_role using (true) with check (true);
drop policy if exists answer_engine_runs_staff_read on public.answer_engine_runs;
create policy answer_engine_runs_staff_read on public.answer_engine_runs
  for select to authenticated using (
    organization_id is not null and public.is_org_staff(organization_id)
  );

drop policy if exists answer_engine_feedback_service_role on public.answer_engine_feedback;
create policy answer_engine_feedback_service_role on public.answer_engine_feedback
  for all to service_role using (true) with check (true);
drop policy if exists answer_engine_feedback_staff_read on public.answer_engine_feedback;
create policy answer_engine_feedback_staff_read on public.answer_engine_feedback
  for select to authenticated using (
    organization_id is not null and public.is_org_staff(organization_id)
  );

drop policy if exists answer_engine_usage_service_role on public.answer_engine_usage;
create policy answer_engine_usage_service_role on public.answer_engine_usage
  for all to service_role using (true) with check (true);

create or replace function public.answer_engine_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'answer-engine records are append-only';
end $$;

drop trigger if exists answer_engine_runs_append_only on public.answer_engine_runs;
create trigger answer_engine_runs_append_only
before update or delete on public.answer_engine_runs
for each row execute function public.answer_engine_append_only();

drop trigger if exists answer_engine_feedback_append_only on public.answer_engine_feedback;
create trigger answer_engine_feedback_append_only
before update or delete on public.answer_engine_feedback
for each row execute function public.answer_engine_append_only();

create or replace function public.answer_engine_feedback_owner_check()
returns trigger language plpgsql as $$
declare
  run_organization uuid;
begin
  select organization_id into run_organization
  from public.answer_engine_runs where id = new.run_id;
  if not found or run_organization is distinct from new.organization_id then
    raise exception 'answer-engine feedback organization mismatch';
  end if;
  return new;
end $$;

drop trigger if exists answer_engine_feedback_owner_check on public.answer_engine_feedback;
create trigger answer_engine_feedback_owner_check
before insert on public.answer_engine_feedback
for each row execute function public.answer_engine_feedback_owner_check();

create or replace function public.answer_engine_consume_budget(
  p_organization_id uuid,
  p_units integer,
  p_org_limit integer,
  p_global_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_global_used integer;
  v_org_used integer;
begin
  if p_units is null or p_units < 1 or p_units > 1000
    or p_global_limit is null or p_global_limit < 1
    or p_org_limit is null or p_org_limit < 0 then
    return false;
  end if;
  v_day_start := v_day::timestamp at time zone 'UTC';
  v_day_end := (v_day + 1)::timestamp at time zone 'UTC';

  insert into public.answer_engine_usage(day, scope, units)
  values (v_day, 'global', 0)
  on conflict (day, scope) do nothing;
  select units into v_global_used
  from public.answer_engine_usage
  where day = v_day and scope = 'global'
  for update;
  v_global_used := coalesce(v_global_used, 0);

  if p_organization_id is not null then
    insert into public.answer_engine_usage(day, scope, units)
    values (v_day, 'org:' || p_organization_id::text, 0)
    on conflict (day, scope) do nothing;
    select units into v_org_used
    from public.answer_engine_usage
    where day = v_day and scope = 'org:' || p_organization_id::text
    for update;
    v_org_used := coalesce(v_org_used, 0) + (
      select count(*)::integer
      from public.research_queries
      where organization_id = p_organization_id
        and cached = false
        and created_at >= v_day_start
        and created_at < v_day_end
    );
    if p_org_limit = 0 or v_org_used + p_units > p_org_limit then
      return false;
    end if;
  end if;
  if v_global_used + p_units > p_global_limit then
    return false;
  end if;

  update public.answer_engine_usage
  set units = units + p_units
  where day = v_day and scope = 'global';
  if p_organization_id is not null then
    update public.answer_engine_usage
    set units = units + p_units
    where day = v_day and scope = 'org:' || p_organization_id::text;
  end if;
  return true;
end $$;

revoke all on function public.answer_engine_consume_budget(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.answer_engine_consume_budget(uuid, integer, integer, integer)
  to service_role;

-- Rollback:
-- revoke execute on function public.answer_engine_consume_budget(uuid, integer, integer, integer) from service_role;
-- drop function if exists public.answer_engine_consume_budget(uuid, integer, integer, integer);
-- drop trigger if exists answer_engine_feedback_owner_check on public.answer_engine_feedback;
-- drop function if exists public.answer_engine_feedback_owner_check();
-- drop trigger if exists answer_engine_feedback_append_only on public.answer_engine_feedback;
-- drop trigger if exists answer_engine_runs_append_only on public.answer_engine_runs;
-- drop function if exists public.answer_engine_append_only();
-- drop policy if exists answer_engine_usage_service_role on public.answer_engine_usage;
-- drop policy if exists answer_engine_feedback_staff_read on public.answer_engine_feedback;
-- drop policy if exists answer_engine_feedback_service_role on public.answer_engine_feedback;
-- drop policy if exists answer_engine_runs_staff_read on public.answer_engine_runs;
-- drop policy if exists answer_engine_runs_service_role on public.answer_engine_runs;
-- drop policy if exists answer_cache_staff_read on public.answer_cache;
-- drop policy if exists answer_cache_service_role on public.answer_cache;
-- drop policy if exists answer_source_cache_service_role on public.answer_source_cache;
-- drop table if exists public.answer_engine_usage;
-- drop table if exists public.answer_engine_feedback;
-- drop table if exists public.answer_engine_runs;
-- drop table if exists public.answer_cache;
-- drop table if exists public.answer_source_cache;
