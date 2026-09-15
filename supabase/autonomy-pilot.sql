create table if not exists public.pilot_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  run_id uuid not null references public.resolution_runs(id),
  ticket_id uuid not null references public.tickets(id),
  capability_id text, capability_version integer,
  resolved_at timestamptz not null,
  review_status text not null default 'pending' check (review_status in ('pending','confirmed','incorrect','unsafe')),
  review_source text not null default 'admin' check (review_source in ('admin','reopen')),
  reviewed_by uuid, reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now(),
  unique (run_id)
);

create index if not exists pilot_reviews_org_date_idx
  on public.pilot_reviews (organization_id, resolved_at desc);

alter table public.pilot_reviews enable row level security;
drop policy if exists pilot_reviews_staff_read on public.pilot_reviews;
create policy pilot_reviews_staff_read on public.pilot_reviews
  for select using (public.is_org_staff(organization_id));

create or replace function public.pilot_reviews_review_only()
returns trigger language plpgsql as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.run_id is distinct from old.run_id
    or new.ticket_id is distinct from old.ticket_id
    or new.capability_id is distinct from old.capability_id
    or new.capability_version is distinct from old.capability_version
    or new.resolved_at is distinct from old.resolved_at
    or new.created_at is distinct from old.created_at then
    raise exception 'pilot_reviews are append-only except review columns';
  end if;
  return new;
end;
$$;

drop trigger if exists pilot_reviews_review_only on public.pilot_reviews;
create trigger pilot_reviews_review_only
before update on public.pilot_reviews
for each row execute function public.pilot_reviews_review_only();
