create table if not exists public.research_cache (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('tavily', 'brave')),
  query_hash text not null,
  response jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (organization_id, provider, query_hash)
);

create table if not exists public.research_queries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  provider text not null check (provider in ('tavily', 'brave')),
  query text not null check (length(query) <= 120),
  cached boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists research_queries_organization_created_idx
  on public.research_queries(organization_id, created_at);

create table if not exists public.research_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.resolution_runs(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  query_id uuid not null references public.research_queries(id) on delete cascade,
  url text not null,
  domain text not null,
  title text not null,
  snippet text not null check (length(snippet) <= 1500),
  trust text not null check (trust in ('vendor', 'community')),
  judgement text not null check (judgement in ('supports', 'contradicts', 'irrelevant', 'unjudged')),
  hypothesis_id text,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists research_sources_run_idx
  on public.research_sources(run_id);

alter table public.research_cache enable row level security;
alter table public.research_queries enable row level security;
alter table public.research_sources enable row level security;

drop policy if exists research_cache_staff_read on public.research_cache;
create policy research_cache_staff_read on public.research_cache
  for select to authenticated
  using (public.is_org_staff(organization_id));

drop policy if exists research_queries_staff_read on public.research_queries;
create policy research_queries_staff_read on public.research_queries
  for select to authenticated
  using (public.is_org_staff(organization_id));

drop policy if exists research_sources_staff_read on public.research_sources;
create policy research_sources_staff_read on public.research_sources
  for select to authenticated
  using (public.is_org_staff(organization_id));

create or replace function public.research_queries_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'research queries are append-only';
end $$;

drop trigger if exists research_queries_immutable on public.research_queries;
create trigger research_queries_immutable
before update or delete on public.research_queries
for each row execute function public.research_queries_immutable();

create or replace function public.research_sources_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'research sources are append-only';
end $$;

drop trigger if exists research_sources_immutable on public.research_sources;
create trigger research_sources_immutable
before update or delete on public.research_sources
for each row execute function public.research_sources_immutable();
