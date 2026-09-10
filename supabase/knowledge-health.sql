-- Additive, idempotent migration. Apply manually after the knowledge schema.

create table if not exists public.knowledge_health_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  guide_slug text check (length(guide_slug) <= 120),
  kind text not null check (kind in ('outdated','broken_link','low_success','high_escalation','missing_guide','conflicting')),
  severity text not null check (severity in ('info','warning','critical')),
  summary text not null check (length(summary) <= 500),
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','acknowledged','dismissed')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists knowledge_health_findings_org_kind_slug_idx
  on public.knowledge_health_findings (
    organization_id,
    kind,
    coalesce(guide_slug, '')
  );

create index if not exists knowledge_health_findings_org_status_idx
  on public.knowledge_health_findings (organization_id, status);

alter table public.knowledge_health_findings enable row level security;

drop policy if exists "Organization members read knowledge health findings"
  on public.knowledge_health_findings;
create policy "Organization members read knowledge health findings"
  on public.knowledge_health_findings for select
  using (public.is_org_member(organization_id));

-- Rollback:
-- drop table if exists public.knowledge_health_findings;
