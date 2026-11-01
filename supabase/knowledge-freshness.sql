-- E5a knowledge freshness. Additive, idempotent migration.
-- Apply manually after knowledge-governance.sql and knowledge-health.sql.

create table if not exists public.knowledge_guide_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  guide_slug text not null check (length(guide_slug) between 1 and 120),
  verified_by uuid references auth.users(id),
  note text check (note is null or length(note) <= 500),
  verified_at timestamptz not null default now()
);

create index if not exists knowledge_guide_verifications_org_slug_idx
  on public.knowledge_guide_verifications (organization_id, guide_slug, verified_at desc);

alter table public.knowledge_guide_verifications enable row level security;

drop policy if exists "Organization members read knowledge guide verifications"
  on public.knowledge_guide_verifications;
create policy "Organization members read knowledge guide verifications"
  on public.knowledge_guide_verifications for select
  using (public.is_org_member(organization_id));

-- Rollback (drops verification history; review before running):
-- drop table if exists public.knowledge_guide_verifications;
