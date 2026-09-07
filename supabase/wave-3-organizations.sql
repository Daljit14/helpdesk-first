-- Wave 3 organization onboarding, RBAC, invitations, and SSO support.
-- Run after admin-dashboard.sql, ticket-workflow.sql, secure-attachments.sql,
-- and wave-1-2-remediation.sql.

create extension if not exists pgcrypto;

alter table public.organization_members
  drop constraint if exists organization_members_role_check;
update public.organization_members
set role = 'org_admin'
where role = 'admin';
alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('requester', 'support_agent', 'org_admin', 'platform_admin', 'admin'))
  not valid;
alter table public.organization_members
  validate constraint organization_members_role_check;

alter table public.organization_members
  add column if not exists joined_via text not null default 'seed'
    check (joined_via in ('seed', 'invitation', 'domain', 'default')),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  domain text not null check (domain = lower(domain)),
  verified boolean not null default false,
  verification_token text not null default encode(gen_random_bytes(16), 'hex'),
  verified_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (domain)
);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('requester', 'support_agent', 'org_admin')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.is_org_staff(org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org
      and user_id = auth.uid()
      and role in ('support_agent', 'org_admin', 'admin')
  );
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = org
      and user_id = auth.uid()
      and role in ('org_admin', 'admin')
  );
$$;

alter table public.platform_admins enable row level security;
alter table public.organization_domains enable row level security;
alter table public.organization_invitations enable row level security;

drop policy if exists "Platform admins view their grant" on public.platform_admins;
create policy "Platform admins view their grant"
  on public.platform_admins for select
  using (user_id = auth.uid());

drop policy if exists "Org admins read domains" on public.organization_domains;
create policy "Org admins read domains"
  on public.organization_domains for select
  using (public.is_org_admin(organization_id));

drop policy if exists "Org admins read invitations" on public.organization_invitations;
create policy "Org admins read invitations"
  on public.organization_invitations for select
  using (public.is_org_admin(organization_id));

drop policy if exists "Org admins read members" on public.organization_members;
create policy "Org admins read members"
  on public.organization_members for select
  using (public.is_org_admin(organization_id));

drop policy if exists "Org members read org tickets" on public.tickets;
create policy "Org members read org tickets"
  on public.tickets for select
  using (public.is_org_staff(organization_id));
drop policy if exists "Org members read ticket events" on public.ticket_events;
create policy "Org members read ticket events"
  on public.ticket_events for select
  using (public.is_org_staff(organization_id));
drop policy if exists "Organization members read comments" on public.ticket_comments;
create policy "Organization members read comments"
  on public.ticket_comments for select
  using (public.is_org_staff(organization_id));
drop policy if exists "Organization members read actions" on public.ticket_actions;
create policy "Organization members read actions"
  on public.ticket_actions for select
  using (public.is_org_staff(organization_id));
drop policy if exists "Organization members read system events" on public.ticket_system_events;
create policy "Organization members read system events"
  on public.ticket_system_events for select
  using (public.is_org_staff(organization_id));
drop policy if exists "Organization members read attachment policies" on public.attachment_policies;
create policy "Organization members read attachment policies"
  on public.attachment_policies for select
  using (public.is_org_staff(organization_id));
drop policy if exists "Organization members read attachments" on public.ticket_attachments;
create policy "Organization members read attachments"
  on public.ticket_attachments for select
  using (organization_id is not null and public.is_org_staff(organization_id));
drop policy if exists "Organization members read attachment events" on public.attachment_events;
create policy "Organization members read attachment events"
  on public.attachment_events for select
  using (organization_id is not null and public.is_org_staff(organization_id));
drop policy if exists "Organization members read step outcomes" on public.ticket_step_outcomes;
create policy "Organization members read step outcomes"
  on public.ticket_step_outcomes for select
  using (organization_id is not null and public.is_org_staff(organization_id));
drop policy if exists "Organization members read organization policies" on public.organization_policies;
create policy "Organization members read organization policies"
  on public.organization_policies for select
  using (public.is_org_staff(organization_id));

create or replace function public.accept_invitation(raw_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text := lower(auth.jwt() ->> 'email');
  invitation public.organization_invitations%rowtype;
begin
  if auth.uid() is null or current_email is null or raw_token is null then
    raise exception 'Invitation is invalid';
  end if;
  select *
  into invitation
  from public.organization_invitations
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex')
    and email = current_email
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;
  if not found then
    raise exception 'Invitation is invalid or expired';
  end if;
  insert into public.organization_members(
    organization_id, user_id, role, invited_by, joined_via, updated_at
  )
  values (
    invitation.organization_id, auth.uid(), invitation.role, invitation.invited_by,
    'invitation', now()
  )
  on conflict (organization_id, user_id) do update
  set role = case
      when public.organization_members.role in ('org_admin', 'admin')
        then public.organization_members.role
      else excluded.role
    end,
    joined_via = 'invitation',
    invited_by = excluded.invited_by,
    updated_at = now();
  update public.organization_invitations
  set accepted_at = now(), accepted_by = auth.uid()
  where id = invitation.id;
  return invitation.organization_id;
end;
$$;

create or replace function public.claim_domain_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  email_domain text := lower(split_part(auth.jwt() ->> 'email', '@', 2));
  matched_org uuid;
begin
  if auth.uid() is null or email_domain is null or email_domain = '' then
    return null;
  end if;
  select organization_id into matched_org
  from public.organization_domains
  where domain = email_domain and verified = true
  order by created_at
  limit 1;
  if matched_org is null then
    return null;
  end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = matched_org and user_id = auth.uid()
  ) then
    insert into public.organization_members(
      organization_id, user_id, role, joined_via, updated_at
    )
    values (matched_org, auth.uid(), 'requester', 'domain', now());
  end if;
  return matched_org;
end;
$$;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
revoke all on function public.claim_domain_membership() from public, anon;
grant execute on function public.claim_domain_membership() to authenticated;

-- Destructive rollback; run only with approval:
-- drop function if exists public.claim_domain_membership();
-- drop function if exists public.accept_invitation(text);
-- drop policy if exists "Org admins read members" on public.organization_members;
-- drop policy if exists "Org admins read invitations" on public.organization_invitations;
-- drop policy if exists "Org admins read domains" on public.organization_domains;
-- drop policy if exists "Platform admins view their grant" on public.platform_admins;
-- drop table if exists public.organization_invitations;
-- drop table if exists public.organization_domains;
-- drop table if exists public.platform_admins;
-- alter table public.organization_members drop column if exists joined_via;
-- alter table public.organization_members drop column if exists updated_at;
