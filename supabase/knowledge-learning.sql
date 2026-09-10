create table if not exists public.knowledge_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  kind text not null check (kind in ('new_guide','guide_update')),
  related_slug text check (length(related_slug) <= 120),
  title text not null check (length(title) <= 160),
  content jsonb not null,
  confirmation text not null check (confirmation in ('user_confirmed','verification_exception')),
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  review_note text check (length(review_note) <= 1000),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_guide_id uuid references public.knowledge_guides(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_drafts_organization_idx
  on public.knowledge_drafts(organization_id);
create index if not exists knowledge_drafts_organization_status_idx
  on public.knowledge_drafts(organization_id, status);

alter table public.knowledge_drafts enable row level security;

drop policy if exists "Organization members read knowledge drafts"
  on public.knowledge_drafts;
create policy "Organization members read knowledge drafts"
  on public.knowledge_drafts for select
  using (
    organization_id is not null
    and public.is_org_member(organization_id)
  );

-- Rollback (destructive; review before running):
-- drop policy if exists "Organization members read knowledge drafts"
--   on public.knowledge_drafts;
-- drop index if exists knowledge_drafts_organization_status_idx;
-- drop index if exists knowledge_drafts_organization_idx;
-- drop table if exists public.knowledge_drafts;
