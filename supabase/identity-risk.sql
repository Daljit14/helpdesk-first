create table if not exists public.staff_caller_verifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  subject_user_id uuid not null references auth.users(id) on delete cascade,
  verified_by uuid not null references auth.users(id),
  method text not null check (method in ('directory_callback','manager_confirmed','idp_push')),
  privileged boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists staff_caller_verifications_org_ticket_created_idx
  on public.staff_caller_verifications(organization_id, ticket_id, created_at desc);

alter table public.staff_caller_verifications enable row level security;
drop policy if exists "Organization staff read caller verifications"
  on public.staff_caller_verifications;
create policy "Organization staff read caller verifications"
  on public.staff_caller_verifications for select
  using (public.is_org_staff(organization_id));

revoke insert, update, delete on public.staff_caller_verifications
  from anon, authenticated;
grant select on public.staff_caller_verifications to authenticated;
grant all on public.staff_caller_verifications to service_role;

create or replace function public.prevent_staff_caller_verification_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'staff caller verifications are append-only';
end;
$$;

drop trigger if exists staff_caller_verifications_append_only
  on public.staff_caller_verifications;
create trigger staff_caller_verifications_append_only
before update or delete on public.staff_caller_verifications
for each row execute function public.prevent_staff_caller_verification_mutation();

-- Rollback:
-- drop trigger if exists staff_caller_verifications_append_only on public.staff_caller_verifications;
-- drop function if exists public.prevent_staff_caller_verification_mutation();
-- drop policy if exists "Organization staff read caller verifications" on public.staff_caller_verifications;
-- drop table if exists public.staff_caller_verifications;
