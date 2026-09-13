-- Run after knowledge-learning.sql. Additive and idempotent. Do not run automatically.
-- Extends knowledge_drafts into full learning candidates and adds the
-- knowledge_learning_events outbox that feeds candidate generation.

alter table public.knowledge_drafts
  add column if not exists article jsonb,
  add column if not exists source_resolution_hash text check (length(source_resolution_hash) <= 64),
  add column if not exists redaction_summary jsonb not null default '{}'::jsonb,
  add column if not exists similar_slugs text[] not null default '{}',
  add column if not exists model_provider text check (length(model_provider) <= 40),
  add column if not exists model_version text check (length(model_version) <= 80),
  add column if not exists prompt_version text check (length(prompt_version) <= 40),
  add column if not exists generated_at timestamptz,
  add column if not exists rejection_reason text check (length(rejection_reason) <= 1000),
  add column if not exists reviewer_instructions text check (length(reviewer_instructions) <= 1000),
  add column if not exists regeneration_count integer not null default 0 check (regeneration_count between 0 and 1),
  add column if not exists security_review_required boolean not null default false,
  add column if not exists failure_reason text check (length(failure_reason) <= 500),
  add column if not exists published_revision_id bigint references public.knowledge_guide_revisions(id) on delete set null;

alter table public.knowledge_drafts drop constraint if exists knowledge_drafts_status_check;
alter table public.knowledge_drafts
  add constraint knowledge_drafts_status_check check (
    status in (
      'queued',
      'generating',
      'draft',
      'needs_security_review',
      'approved',
      'rejected',
      'published',
      'failed'
    )
  );

create unique index if not exists knowledge_drafts_resolution_hash_idx
  on public.knowledge_drafts (organization_id, source_resolution_hash)
  where source_resolution_hash is not null;

create table if not exists public.knowledge_learning_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'skipped', 'review', 'failed')),
  attempts integer not null default 0,
  last_error text check (length(last_error) <= 500),
  provider text check (length(provider) <= 40),
  latency_ms integer,
  cost_usd numeric(10, 6),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists knowledge_learning_events_pending_idx
  on public.knowledge_learning_events (status, created_at)
  where status in ('pending', 'processing');

alter table public.knowledge_learning_events enable row level security;

drop policy if exists "Organization admins read learning events"
  on public.knowledge_learning_events;
create policy "Organization admins read learning events"
  on public.knowledge_learning_events for select
  using (public.is_org_member(organization_id));

-- Rollback (destructive; review before running):
-- drop table if exists public.knowledge_learning_events;
-- drop index if exists knowledge_drafts_resolution_hash_idx;
-- alter table public.knowledge_drafts drop constraint if exists knowledge_drafts_status_check;
-- alter table public.knowledge_drafts add constraint knowledge_drafts_status_check
--   check (status in ('draft','approved','rejected'));
-- alter table public.knowledge_drafts drop column if exists article, ... ;
