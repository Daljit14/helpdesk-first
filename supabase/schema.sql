-- Run in Supabase SQL Editor (Project > SQL Editor > New query).
-- Tables scoped to the signed-in user via Row Level Security.

create table if not exists public.bookmarks (
  user_id uuid references auth.users (id) on delete cascade,
  issue_id text not null,
  created_at timestamptz default now(),
  primary key (user_id, issue_id)
);

create table if not exists public.guide_progress (
  user_id uuid references auth.users (id) on delete cascade,
  issue_id text not null,
  completed_steps int[] default '{}',
  updated_at timestamptz default now(),
  primary key (user_id, issue_id)
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  issue_id text not null,
  issue_title text not null,
  message text not null,
  status text not null default 'Open',
  created_at timestamptz default now()
);

create table if not exists public.guide_ratings (
  user_id uuid references auth.users (id) on delete cascade,
  issue_id text not null,
  vote text check (vote in ('up', 'down')) not null,
  primary key (user_id, issue_id)
);

-- Public aggregate table updated by a trigger so users can see totals
-- without being able to read each other's individual votes.
create table if not exists public.guide_rating_totals (
  issue_id text primary key,
  up_count int not null default 0,
  down_count int not null default 0,
  updated_at timestamptz default now()
);

alter table public.bookmarks enable row level security;
alter table public.guide_progress enable row level security;
alter table public.tickets enable row level security;
alter table public.guide_ratings enable row level security;
alter table public.guide_rating_totals enable row level security;

create policy "Users manage their own bookmarks" on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own progress" on public.guide_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own tickets" on public.tickets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own ratings" on public.guide_ratings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Everyone can read aggregate rating counts.
create policy "Anyone can read rating totals" on public.guide_rating_totals
  for select using (true);

-- Trigger function: recalculate totals after each rating change.
create or replace function public.recalc_guide_rating_totals()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.guide_rating_totals (issue_id, up_count, down_count)
  select
    coalesce(new.issue_id, old.issue_id) as issue_id,
    count(*) filter (where vote = 'up')::int as up_count,
    count(*) filter (where vote = 'down')::int as down_count
  from public.guide_ratings
  where issue_id = coalesce(new.issue_id, old.issue_id)
  on conflict (issue_id)
  do update set
    up_count = excluded.up_count,
    down_count = excluded.down_count,
    updated_at = now();

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Trigger recalculates on every insert, update, or delete.
drop trigger if exists guide_ratings_recalc_trigger on public.guide_ratings;
create trigger guide_ratings_recalc_trigger
  after insert or update or delete on public.guide_ratings
  for each row execute function public.recalc_guide_rating_totals();
