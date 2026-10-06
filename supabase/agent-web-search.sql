alter table public.research_queries
  add column if not exists agent_session_id uuid
  references public.agent_sessions(id) on delete cascade;
alter table public.research_queries
  alter column run_id drop not null,
  alter column ticket_id drop not null;
alter table public.research_queries
  drop constraint if exists research_queries_owner_check;
alter table public.research_queries
  add constraint research_queries_owner_check
  check ((run_id is not null and ticket_id is not null) or agent_session_id is not null);
create index if not exists research_queries_agent_session_created_idx
  on public.research_queries(agent_session_id, created_at);

alter table public.research_sources
  add column if not exists agent_session_id uuid
  references public.agent_sessions(id) on delete cascade;
alter table public.research_sources
  alter column run_id drop not null,
  alter column ticket_id drop not null;
alter table public.research_sources
  drop constraint if exists research_sources_owner_check;
alter table public.research_sources
  add constraint research_sources_owner_check
  check ((run_id is not null and ticket_id is not null) or agent_session_id is not null);
create index if not exists research_sources_agent_session_idx
  on public.research_sources(agent_session_id);

-- Rollback:
-- drop index if exists public.research_queries_agent_session_created_idx;
-- drop index if exists public.research_sources_agent_session_idx;
-- alter table public.research_queries drop constraint if exists research_queries_owner_check;
-- alter table public.research_sources drop constraint if exists research_sources_owner_check;
-- alter table public.research_queries alter column run_id set not null, alter column ticket_id set not null;
-- alter table public.research_sources alter column run_id set not null, alter column ticket_id set not null;
-- alter table public.research_queries drop column if exists agent_session_id;
-- alter table public.research_sources drop column if exists agent_session_id;
