-- Additive, idempotent D3 service-health schema. Apply after requester-agent-vision.sql.

create table if not exists public.org_status_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'statuspage' check (kind = 'statuspage'),
  name text not null check (char_length(name) between 1 and 80),
  base_url text not null check (
    base_url like 'https://%' and char_length(base_url) <= 200
  ),
  enabled boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, base_url)
);

create index if not exists org_status_sources_org_enabled_idx
  on public.org_status_sources (organization_id, enabled, created_at);

alter table public.org_status_sources enable row level security;

drop policy if exists org_status_sources_member_select
  on public.org_status_sources;
create policy org_status_sources_member_select
  on public.org_status_sources for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists org_status_sources_admin_insert
  on public.org_status_sources;
create policy org_status_sources_admin_insert
  on public.org_status_sources for insert to authenticated
  with check (public.is_org_admin(organization_id));

drop policy if exists org_status_sources_admin_update
  on public.org_status_sources;
create policy org_status_sources_admin_update
  on public.org_status_sources for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

drop policy if exists org_status_sources_admin_delete
  on public.org_status_sources;
create policy org_status_sources_admin_delete
  on public.org_status_sources for delete to authenticated
  using (public.is_org_admin(organization_id));

revoke all on public.org_status_sources from anon;
grant select, insert, update, delete on public.org_status_sources to authenticated;
grant all on public.org_status_sources to service_role;

create table if not exists public.outage_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.agent_sessions(id) on delete set null,
  source text not null check (
    source in ('microsoft365', 'google_workspace', 'statuspage')
  ),
  incident_id text not null check (char_length(incident_id) <= 128),
  service text not null check (char_length(service) <= 80),
  title text not null check (char_length(title) <= 200),
  incident_url text not null check (incident_url like 'https://%'),
  status text not null default 'active'
    check (status in ('active', 'notified', 'cancelled')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (user_id, source, incident_id)
);

create index if not exists outage_subscriptions_status_org_idx
  on public.outage_subscriptions (status, organization_id);

alter table public.outage_subscriptions enable row level security;

drop policy if exists outage_subscriptions_requester_or_staff_select
  on public.outage_subscriptions;
create policy outage_subscriptions_requester_or_staff_select
  on public.outage_subscriptions for select to authenticated
  using (
    user_id = auth.uid() or public.is_org_staff(organization_id)
  );

drop policy if exists outage_subscriptions_requester_insert
  on public.outage_subscriptions;
create policy outage_subscriptions_requester_insert
  on public.outage_subscriptions for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_org_member(organization_id)
  );

drop policy if exists outage_subscriptions_requester_cancel
  on public.outage_subscriptions;
create policy outage_subscriptions_requester_cancel
  on public.outage_subscriptions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'cancelled');

revoke all on public.outage_subscriptions from anon;
grant select, insert, update on public.outage_subscriptions to authenticated;
grant all on public.outage_subscriptions to service_role;

alter table public.agent_steps
  drop constraint if exists agent_steps_kind_check;
alter table public.agent_steps
  add constraint agent_steps_kind_check check (kind in (
    'user_message','thinking_summary','tool_started','tool_result','tool_rejected','final',
    'claim_stripped','escalated','halted','error','action_proposed','consent_required',
    'consent_decided','consent_declined','action_executing','verification_result',
    'rollback_result','confirm_required','user_feedback','resolved','security_incident',
    'action_rejected','session_consent_offered','session_consent_granted',
    'session_consent_revoked','action_autorun','action_shadowed','tier_demoted',
    'screenshot_received','screenshot_rejected','service_incident'
  ));
