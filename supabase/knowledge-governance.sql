-- Run after schema.sql, admin-dashboard.sql, and ticket-workflow.sql.
-- This migration is additive and idempotent. Do not run automatically.

create table if not exists public.knowledge_guides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  slug text not null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'approved', 'retired')),
  version integer not null default 1 check (version > 0),
  source_title text,
  source_url text,
  source_owner text,
  reviewer text,
  retrieved_at timestamptz,
  expires_at timestamptz,
  supported_platforms text[] not null default '{}',
  risk_tier text not null default 'low'
    check (risk_tier in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create unique index if not exists knowledge_guides_global_slug_idx
  on public.knowledge_guides (slug) where organization_id is null;

create table if not exists public.knowledge_guide_revisions (
  id bigint generated always as identity primary key,
  guide_id uuid not null references public.knowledge_guides(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  from_status text not null,
  to_status text not null,
  version integer not null,
  note text,
  prior_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_provider_calls (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  provider text not null,
  model text not null,
  outcome text not null check (outcome in ('ok', 'timeout', 'invalid', 'unsafe', 'error', 'budget', 'fallback')),
  decision text,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  shadow_agree_decision boolean,
  shadow_agree_slug boolean,
  created_at timestamptz not null default now()
);

alter table public.knowledge_guides enable row level security;
alter table public.knowledge_guide_revisions enable row level security;
alter table public.ai_provider_calls enable row level security;

create or replace function public.prevent_knowledge_revision_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'knowledge guide revisions are immutable';
end;
$$;

drop trigger if exists knowledge_revisions_immutable
  on public.knowledge_guide_revisions;
create trigger knowledge_revisions_immutable
before update or delete on public.knowledge_guide_revisions
for each row execute function public.prevent_knowledge_revision_mutation();

insert into public.knowledge_guides (
  organization_id, slug, title, status, version, source_title, source_url,
  retrieved_at, supported_platforms, risk_tier
)
select
  null,
  slug,
  initcap(replace(slug, '-', ' ')),
  'approved',
  1,
  initcap(replace(slug, '-', ' ')),
  'https://helpdesk-first.vercel.app/issues/' || slug,
  now(),
  array['Windows', 'Mac', 'iOS', 'Android', 'Other']::text[],
  'low'
from unnest(array[
  'slow-computer','computer-wont-start','computer-freezing','low-storage',
  'blue-screen','no-internet','wifi-disconnecting','slow-internet',
  'ethernet-not-working','vpn-problem','printer-offline','print-job-stuck',
  'paper-jam','poor-print-quality','wrong-default-printer','email-not-syncing',
  'cannot-send-email','not-receiving-email','attachment-problem','email-sign-in',
  'app-wont-open','install-problem','app-frozen','update-failure','wrong-default-app',
  'no-sound','camera-mic-not-working','mic-not-working','bluetooth-headset',
  'screen-sharing','forgot-password','account-locked','2fa-not-working',
  'password-expired','suspicious-signin-alert','cannot-reset-password',
  'sso-login-failure','account-wrong-details','security-question-not-accepted',
  'session-keeps-logging-out','shared-drive-access','file-sync-error','file-wont-upload',
  'permission-denied-file','lost-deleted-file','cannot-share-file',
  'storage-quota-exceeded','duplicate-files-syncing','cannot-open-shared-folder',
  'version-history-missing','cant-join-meeting','no-video-in-meeting',
  'echo-audio-feedback','meeting-screen-share-issue','meeting-recording-issue',
  'meeting-audio-not-working','virtual-background-not-working',
  'meeting-invite-not-received','breakout-rooms-not-working','meeting-app-crashing',
  'work-email-not-syncing-mobile','mobile-app-crashing','push-notifications-not-working',
  'mobile-hotspot-not-working','mobile-app-wont-update','device-not-enrolling-mdm',
  'mobile-battery-draining-fast','text-calls-not-working-work-line','mobile-storage-full',
  'find-my-device-not-working','external-monitor-not-detected','usb-device-not-recognized',
  'keyboard-mouse-not-working','docking-station-not-charging',
  'laptop-battery-draining-fast','external-webcam-not-detected','touchpad-not-working',
  'external-drive-not-recognized','monitor-resolution-wrong','laptop-overheating',
  'chat-notifications-not-working','calendar-invites-not-syncing',
  'shared-calendar-not-updating','cannot-create-meeting-invite','app-keeps-signing-out',
  'cannot-tag-mention-colleague','workspace-status-stuck','file-preview-not-loading',
  'group-channel-missing','app-integration-not-working','antivirus-alert',
  'suspicious-popups','ransomware-warning','firewall-blocking-app',
  'unknown-device-on-account','phishing-email-received','browser-hijacked',
  'encryption-status-unknown','lost-stolen-device','usb-drive-security-warning'
]) as issue(slug)
on conflict do nothing;

create or replace function public.approved_guide_slugs(org uuid)
returns setof text
language sql
security definer
set search_path = public
as $$
  with global_approved as (
    select g.slug
    from public.knowledge_guides g
    where g.organization_id is null
      and g.status = 'approved'
      and (g.expires_at is null or g.expires_at > now())
      and not exists (
        select 1 from public.knowledge_guides retired
        where retired.organization_id = org
          and retired.slug = g.slug
          and retired.status = 'retired'
      )
  ),
  organization_approved as (
    select g.slug
    from public.knowledge_guides g
    where g.organization_id = org
      and g.status = 'approved'
      and (g.expires_at is null or g.expires_at > now())
  )
  select slug from global_approved
  union
  select slug from organization_approved;
$$;

revoke all on function public.approved_guide_slugs(uuid) from public, anon, authenticated;
grant execute on function public.approved_guide_slugs(uuid) to service_role;

comment on function public.approved_guide_slugs(uuid)
is 'Service-role-only approved guide catalog; callers should use the admin client.';

-- Rollback (destructive; review before running):
-- drop function if exists public.approved_guide_slugs(uuid);
-- drop trigger if exists knowledge_revisions_immutable on public.knowledge_guide_revisions;
-- drop function if exists public.prevent_knowledge_revision_mutation();
-- drop table if exists public.ai_provider_calls;
-- drop table if exists public.knowledge_guide_revisions;
-- drop table if exists public.knowledge_guides;
