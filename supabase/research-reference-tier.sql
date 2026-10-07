alter table public.research_sources
  drop constraint if exists research_sources_trust_check;

alter table public.research_sources
  add constraint research_sources_trust_check
  check (trust in ('vendor', 'community', 'reference'));

-- Rollback:
-- alter table public.research_sources
--   drop constraint if exists research_sources_trust_check;
-- alter table public.research_sources
--   add constraint research_sources_trust_check
--   check (trust in ('vendor', 'community'));
