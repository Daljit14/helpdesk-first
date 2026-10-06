-- Apply after research.sql, admin-dashboard.sql, and wave-3-organizations.sql.

create table if not exists public.org_research_vendor_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null check (
    char_length(domain) between 4 and 253
    and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
  ),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, domain)
);

create index if not exists org_research_vendor_domains_org_created_idx
  on public.org_research_vendor_domains (organization_id, created_at);

alter table public.org_research_vendor_domains enable row level security;

drop policy if exists org_research_vendor_domains_member_select
  on public.org_research_vendor_domains;
create policy org_research_vendor_domains_member_select
  on public.org_research_vendor_domains for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists org_research_vendor_domains_admin_insert
  on public.org_research_vendor_domains;
create policy org_research_vendor_domains_admin_insert
  on public.org_research_vendor_domains for insert to authenticated
  with check (
    public.is_org_admin(organization_id)
    and added_by = auth.uid()
  );

drop policy if exists org_research_vendor_domains_admin_delete
  on public.org_research_vendor_domains;
create policy org_research_vendor_domains_admin_delete
  on public.org_research_vendor_domains for delete to authenticated
  using (public.is_org_admin(organization_id));

revoke all on public.org_research_vendor_domains from public, anon;
grant select, insert, delete on public.org_research_vendor_domains to authenticated;
grant all on public.org_research_vendor_domains to service_role;

create or replace function public.enforce_org_research_vendor_domain_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(new.organization_id::text, 0)
  );

  if (
    select count(*)
    from public.org_research_vendor_domains
    where organization_id = new.organization_id
  ) >= 25 then
    raise exception 'An organization may trust at most 25 vendor domains.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists org_research_vendor_domains_limit
  on public.org_research_vendor_domains;
create trigger org_research_vendor_domains_limit
  before insert on public.org_research_vendor_domains
  for each row execute function public.enforce_org_research_vendor_domain_limit();

-- Rollback:
-- drop trigger if exists org_research_vendor_domains_limit on public.org_research_vendor_domains;
-- drop function if exists public.enforce_org_research_vendor_domain_limit();
-- drop table if exists public.org_research_vendor_domains;
