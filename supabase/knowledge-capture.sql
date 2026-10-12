-- Additive, idempotent E4 knowledge-capture migration.
-- Apply manually after knowledge-learning-candidates.sql. Do not run automatically.

alter table public.knowledge_learning_events
  add column if not exists source_kind text not null default 'ticket';
alter table public.knowledge_learning_events
  drop constraint if exists knowledge_learning_events_source_kind_check;
alter table public.knowledge_learning_events
  add constraint knowledge_learning_events_source_kind_check
  check (source_kind in ('ticket','agent_session','answer_run'));
alter table public.knowledge_learning_events
  add column if not exists agent_session_id uuid
  references public.agent_sessions(id) on delete cascade;
alter table public.knowledge_learning_events
  drop constraint if exists knowledge_learning_events_ticket_id_key;
create unique index if not exists knowledge_learning_events_ticket_source_idx
  on public.knowledge_learning_events(ticket_id, source_kind);
create unique index if not exists knowledge_learning_events_agent_session_idx
  on public.knowledge_learning_events(agent_session_id)
  where agent_session_id is not null;

create table if not exists public.knowledge_draft_clusters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cluster_key text not null,
  platform text not null check (length(platform) <= 40),
  title text not null check (length(title) <= 160),
  tokens text[] not null default '{}',
  member_count integer not null default 1 check (member_count >= 1),
  answer_fixed_count integer not null default 0 check (answer_fixed_count >= 0),
  primary_draft_id uuid not null references public.knowledge_drafts(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists knowledge_draft_clusters_open_key_idx
  on public.knowledge_draft_clusters(organization_id, cluster_key)
  where status = 'open';
create index if not exists knowledge_draft_clusters_org_platform_idx
  on public.knowledge_draft_clusters(organization_id, platform, status);

alter table public.knowledge_drafts
  add column if not exists cluster_id uuid
  references public.knowledge_draft_clusters(id) on delete set null;
alter table public.knowledge_drafts
  add column if not exists source_kind text not null default 'ticket';
alter table public.knowledge_drafts
  drop constraint if exists knowledge_drafts_source_kind_check;
alter table public.knowledge_drafts
  add constraint knowledge_drafts_source_kind_check
  check (source_kind in ('ticket','agent_session','answer_run'));
alter table public.knowledge_drafts
  add column if not exists agent_session_id uuid
  references public.agent_sessions(id) on delete cascade;
alter table public.knowledge_drafts drop constraint if exists knowledge_drafts_status_check;
alter table public.knowledge_drafts
  add constraint knowledge_drafts_status_check check (
    status in (
      'queued','generating','draft','clustered','needs_security_review',
      'approved','rejected','published','failed'
    )
  );

do $$
begin
  if to_regclass('public.knowledge_health_findings') is not null then
    alter table public.knowledge_health_findings
      drop constraint if exists knowledge_health_findings_kind_check;
    alter table public.knowledge_health_findings
      add constraint knowledge_health_findings_kind_check
      check (kind in (
        'outdated','broken_link','low_success','high_escalation',
        'missing_guide','conflicting','guide_reported_wrong'
      ));
  end if;
end $$;

alter table public.knowledge_draft_clusters enable row level security;
drop policy if exists knowledge_draft_clusters_member_select
  on public.knowledge_draft_clusters;
create policy knowledge_draft_clusters_member_select
  on public.knowledge_draft_clusters for select
  using (public.is_org_member(organization_id));
revoke all on public.knowledge_draft_clusters from public, anon, authenticated;
grant select on public.knowledge_draft_clusters to authenticated;
grant all on public.knowledge_draft_clusters to service_role;

-- Rollback (destructive; review before running):
-- drop policy if exists knowledge_draft_clusters_member_select on public.knowledge_draft_clusters;
-- drop table if exists public.knowledge_draft_clusters;
-- alter table public.knowledge_drafts drop column if exists cluster_id;
-- alter table public.knowledge_drafts drop column if exists source_kind;
-- alter table public.knowledge_drafts drop column if exists agent_session_id;
-- alter table public.knowledge_drafts drop constraint if exists knowledge_drafts_status_check;
-- alter table public.knowledge_drafts add constraint knowledge_drafts_status_check
--   check (status in ('queued','generating','draft','needs_security_review','approved','rejected','published','failed'));
-- do $$ begin
--   if to_regclass('public.knowledge_health_findings') is not null then
--     alter table public.knowledge_health_findings drop constraint if exists knowledge_health_findings_kind_check;
--     alter table public.knowledge_health_findings add constraint knowledge_health_findings_kind_check
--       check (kind in ('outdated','broken_link','low_success','high_escalation','missing_guide','conflicting'));
--   end if;
-- end $$;
-- drop index if exists knowledge_learning_events_ticket_source_idx;
-- drop index if exists knowledge_learning_events_agent_session_idx;
-- Delete duplicate (ticket_id) rows from other source kinds before restoring
-- the original uniqueness constraint:
-- alter table public.knowledge_learning_events
--   add constraint knowledge_learning_events_ticket_id_key unique (ticket_id);
-- alter table public.knowledge_learning_events drop column if exists agent_session_id;
-- alter table public.knowledge_learning_events drop column if exists source_kind;
