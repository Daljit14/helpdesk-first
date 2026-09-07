-- Secure ticket attachment storage and retention.
-- Run after supabase/schema.sql, cloud-features.sql, and admin-dashboard.sql.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ticket-attachments-quarantine',
  'ticket-attachments-quarantine',
  false,
  20971520,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public)
values ('ticket-attachments-private', 'ticket-attachments-private', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated users upload attachment quarantine files"
  on storage.objects;
create policy "Authenticated users upload attachment quarantine files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ticket-attachments-quarantine'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create table if not exists public.attachment_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  max_files_per_ticket int not null default 10,
  max_file_bytes bigint not null default 20971520,
  max_total_bytes bigint not null default 104857600,
  allowed_mime_types text[] not null default array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf'
  ],
  retention_days int not null default 365,
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete set null,
  uploader_id uuid not null references auth.users(id),
  status text not null check (
    status in ('uploading', 'scanning', 'ready', 'rejected', 'deleted', 'legal_hold')
  ),
  original_name text not null,
  detected_mime text,
  declared_mime text,
  byte_size bigint not null,
  sha256 text,
  width int,
  height int,
  page_count int,
  quarantine_path text,
  storage_path text,
  scan_engine text,
  scan_verdict text check (
    scan_verdict in ('clean', 'infected', 'suspicious', 'unscanned', 'error')
  ),
  scan_detail text,
  scanned_at timestamptz,
  rejection_reason text,
  legal_hold boolean not null default false,
  expires_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ticket_attachments_ticket_idx
  on public.ticket_attachments (ticket_id, created_at);
create index if not exists ticket_attachments_uploader_idx
  on public.ticket_attachments (uploader_id, created_at);
create index if not exists ticket_attachments_expiry_idx
  on public.ticket_attachments (expires_at)
  where expires_at is not null and status = 'ready';

create table if not exists public.attachment_events (
  id bigint generated always as identity primary key,
  attachment_id uuid not null references public.ticket_attachments(id) on delete cascade,
  organization_id uuid,
  actor_id uuid,
  actor_type text not null check (
    actor_type in ('user', 'employee', 'system', 'ai')
  ),
  event_type text not null check (
    event_type in (
      'uploaded',
      'scan_started',
      'scan_completed',
      'ready',
      'rejected',
      'viewed',
      'downloaded',
      'ai_processed',
      'deleted',
      'legal_hold_set',
      'legal_hold_cleared',
      'retention_purged'
    )
  ),
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists attachment_events_attachment_idx
  on public.attachment_events (attachment_id, created_at);

alter table public.attachment_policies enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.attachment_events enable row level security;

drop policy if exists "Organization members read attachment policies"
  on public.attachment_policies;
create policy "Organization members read attachment policies"
  on public.attachment_policies for select
  using (public.is_org_member(organization_id));

drop policy if exists "Requesters read their attachments"
  on public.ticket_attachments;
create policy "Requesters read their attachments"
  on public.ticket_attachments for select
  using (uploader_id = auth.uid());

drop policy if exists "Organization members read attachments"
  on public.ticket_attachments;
create policy "Organization members read attachments"
  on public.ticket_attachments for select
  using (organization_id is not null and public.is_org_member(organization_id));

drop policy if exists "Organization members read attachment events"
  on public.attachment_events;
create policy "Organization members read attachment events"
  on public.attachment_events for select
  using (
    organization_id is not null and public.is_org_member(organization_id)
  );

create or replace function public.attachment_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'attachment_events are immutable';
end;
$$;

drop trigger if exists attachment_events_immutable_trigger
  on public.attachment_events;
create trigger attachment_events_immutable_trigger
before update or delete on public.attachment_events
for each row execute function public.attachment_events_immutable();

create or replace function public.purge_expired_attachments()
returns table (attachment_id uuid, storage_path text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  return query
  with expired as (
    update public.ticket_attachments
    set
      status = 'deleted',
      deleted_at = now(),
      updated_at = now(),
      rejection_reason = 'Retention period expired'
    where status = 'ready'
      and expires_at < now()
      and not legal_hold
    returning id, organization_id, storage_path
  ),
  events as (
    insert into public.attachment_events (
      attachment_id,
      organization_id,
      actor_type,
      event_type,
      detail
    )
    select
      id,
      organization_id,
      'system',
      'retention_purged',
      jsonb_build_object('reason', 'retention_expired')
    from expired
    returning attachment_id
  )
  select expired.id, expired.storage_path
  from expired;
end;
$$;

revoke all on function public.purge_expired_attachments() from public, anon, authenticated;
grant execute on function public.purge_expired_attachments() to service_role;

-- Optional destructive rollback; run only with approval:
-- drop function if exists public.purge_expired_attachments();
-- drop trigger if exists attachment_events_immutable_trigger on public.attachment_events;
-- drop function if exists public.attachment_events_immutable();
-- drop table if exists public.attachment_events;
-- drop table if exists public.ticket_attachments;
-- drop table if exists public.attachment_policies;
-- drop policy if exists "Authenticated users upload attachment quarantine files" on storage.objects;
-- delete from storage.buckets where id in (
--   'ticket-attachments-quarantine',
--   'ticket-attachments-private'
-- );
