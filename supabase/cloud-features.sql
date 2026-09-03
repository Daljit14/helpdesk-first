-- Run after supabase/schema.sql (Project > SQL Editor > New query).
-- Adds: ticket attachments (Storage), realtime updates for tickets, and
-- push notification subscriptions.

-- 1) Ticket attachments ---------------------------------------------------
alter table public.tickets
  add column if not exists attachment_path text;

insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

create policy "Users manage their own ticket attachments"
  on storage.objects for all
  using (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2) Realtime for tickets -------------------------------------------------
-- Lets /tickets update live when a ticket's status changes.
-- If this errors with "already a member", it's already enabled — ignore it.
alter publication supabase_realtime add table public.tickets;

-- 3) Push notification subscriptions --------------------------------------
create table if not exists public.push_subscriptions (
  user_id uuid references auth.users (id) on delete cascade,
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table public.push_subscriptions enable row level security;

create policy "Users manage their own push subscriptions"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
