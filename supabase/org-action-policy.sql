-- G5 organization-scoped AI action policies. Apply after identity-risk.sql
-- and before audit-chain.sql. Do not apply until the pilot is approved.

create or replace function public.org_action_policy_groups_valid(group_ids text[])
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    cardinality(coalesce(group_ids, '{}'::text[])) <= 20
    and array_position(coalesce(group_ids, '{}'::text[]), null::text) is null
    and not exists (
      select 1
      from unnest(coalesce(group_ids, '{}'::text[])) as group_value
      where char_length(group_value) > 200
    );
$$;

create table if not exists public.org_action_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  capability_id text not null check (
    capability_id = '*' or capability_id ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  effect text not null check (effect in ('allow', 'deny')),
  scope_groups text[] not null default '{}'
    check (public.org_action_policy_groups_valid(scope_groups)),
  max_tier text not null default 'consent'
    check (max_tier in ('shadow', 'consent', 'autorun')),
  autorun_windows jsonb not null default '[]'::jsonb
    check (
      jsonb_typeof(autorun_windows) = 'array'
      and jsonb_array_length(autorun_windows) <= 20
    ),
  require_staff_approval boolean not null default false,
  note text not null default '' check (char_length(note) <= 500),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_action_policies_org_capability_idx
  on public.org_action_policies(organization_id, capability_id);

create table if not exists public.org_action_policy_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  policy_id uuid,
  capability_id text not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  "before" jsonb,
  "after" jsonb,
  actor_user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists org_action_policy_events_org_created_idx
  on public.org_action_policy_events(organization_id, created_at desc);

create or replace function public.org_action_policy_events_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'organization action policy events are append-only';
end;
$$;

drop trigger if exists org_action_policy_events_immutable
  on public.org_action_policy_events;
create trigger org_action_policy_events_immutable
before update or delete on public.org_action_policy_events
for each row execute function public.org_action_policy_events_immutable();

alter table public.org_action_policies enable row level security;
alter table public.org_action_policy_events enable row level security;

drop policy if exists org_action_policies_admin_select
  on public.org_action_policies;
drop policy if exists org_action_policies_staff_select
  on public.org_action_policies;
create policy org_action_policies_staff_select
  on public.org_action_policies for select to authenticated
  using (public.is_org_staff(organization_id));

drop policy if exists org_action_policies_admin_insert
  on public.org_action_policies;
create policy org_action_policies_admin_insert
  on public.org_action_policies for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists org_action_policies_admin_update
  on public.org_action_policies;
create policy org_action_policies_admin_update
  on public.org_action_policies for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists org_action_policies_admin_delete
  on public.org_action_policies;
create policy org_action_policies_admin_delete
  on public.org_action_policies for delete to authenticated
  using (public.is_org_admin(organization_id));

drop policy if exists org_action_policy_events_admin_select
  on public.org_action_policy_events;
drop policy if exists org_action_policy_events_staff_select
  on public.org_action_policy_events;
create policy org_action_policy_events_staff_select
  on public.org_action_policy_events for select to authenticated
  using (public.is_org_staff(organization_id));

drop policy if exists org_action_policy_events_service_role
  on public.org_action_policy_events;
create policy org_action_policy_events_service_role
  on public.org_action_policy_events for all to service_role
  using (true) with check (true);

revoke all on public.org_action_policies from public, anon;
revoke all on public.org_action_policy_events from public, anon;
grant select, insert, update, delete
  on public.org_action_policies to authenticated;
grant select on public.org_action_policy_events to authenticated;
revoke insert, update, delete
  on public.org_action_policy_events from anon, authenticated;
grant all on public.org_action_policies to service_role;
grant all on public.org_action_policy_events to service_role;

-- Rollback:
-- drop trigger if exists org_action_policy_events_immutable on public.org_action_policy_events;
-- drop function if exists public.org_action_policy_events_immutable();
-- drop table if exists public.org_action_policy_events;
-- drop table if exists public.org_action_policies;
-- drop function if exists public.org_action_policy_groups_valid(text[]);
