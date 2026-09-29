-- =====================================================================
-- HelpDesk First — remove test/bot data and delete all open tickets
-- Run in: Supabase dashboard → SQL Editor. Dry run by default (dry_run := true);
-- fill test_emails, check the report, then set dry_run := false.
-- Applied to production on 2026-09-24 (see docs/PRODUCTION-ROADMAP-STATUS.md, D0).
-- =====================================================================
create temp table if not exists _cleanup_report (
  step text, detail text
) on commit preserve rows;
truncate _cleanup_report;

do $cleanup$
declare
  -- ---------------- settings ----------------
  dry_run                  boolean := true;
  test_emails              text[]  := array[]::text[];   -- e.g. array['e2e-requester@example.com']
  purge_all_agent_sessions boolean := true;   -- requester agent is not live in prod yet
  test_device_prefix       text    := '1f86dc7b';
  -- -------------------------------------------
  n       bigint;
  r       record;
  report  text := '';
  paths   text;
  cands   text;
begin
  -- ---------- 1. pick targets ----------
  create temp table _t_users on commit drop as
    select id, email from auth.users where lower(email) = any (
      select lower(e) from unnest(test_emails) e);

  create temp table _t_tickets (id uuid primary key) on commit drop;
  insert into _t_tickets
    select id from public.tickets
    where lower(coalesce(status, '')) not in ('resolved', 'closed')
  on conflict do nothing;
  insert into _t_tickets
    select id from public.tickets where user_id in (select id from _t_users)
  on conflict do nothing;
  insert into _t_tickets
    select record_id from public.record_exclusions x
    where x.table_name = 'tickets'
      and exists (select 1 from public.tickets t where t.id = x.record_id)
  on conflict do nothing;

  create temp table _t_sessions (id uuid primary key) on commit drop;
  insert into _t_sessions
    select id from public.agent_sessions s
    where purge_all_agent_sessions
       or s.requester_id in (select id from _t_users)
       or s.backing_ticket_id in (select id from _t_tickets)
       or s.escalation_ticket_id in (select id from _t_tickets)
  on conflict do nothing;

  -- tickets that only existed to back a test session
  insert into _t_tickets
    select backing_ticket_id from public.agent_sessions
    where id in (select id from _t_sessions) and backing_ticket_id is not null
  union
    select escalation_ticket_id from public.agent_sessions
    where id in (select id from _t_sessions) and escalation_ticket_id is not null
  on conflict do nothing;

  create temp table _t_runs (id uuid primary key) on commit drop;
  insert into _t_runs
    select id from public.resolution_runs where ticket_id in (select id from _t_tickets)
  union
    select record_id from public.record_exclusions x
    where x.table_name = 'resolution_runs'
      and exists (select 1 from public.resolution_runs rr where rr.id = x.record_id)
  union
    select resolution_run_id from public.agent_sessions
    where id in (select id from _t_sessions) and resolution_run_id is not null
  on conflict do nothing;

  create temp table _t_devices on commit drop as
    select id, hostname, platform from public.devices
    where id::text like test_device_prefix || '%';

  create temp table _t_attachments on commit drop as
    select id, storage_path, quarantine_path from public.ticket_attachments
    where ticket_id in (select id from _t_tickets)
       or uploader_id in (select id from _t_users);

  -- ---------- 2. report what will go ----------
  for r in
    select coalesce(status, '(null)') as status, count(*) as c
    from public.tickets where id in (select id from _t_tickets)
    group by 1 order by 2 desc
  loop
    report := report || format(E'tickets[%s]: %s\n', r.status, r.c);
  end loop;
  report := report || format(E'tickets total: %s\n', (select count(*) from _t_tickets));
  report := report || format(E'test accounts matched: %s of %s given\n',
    (select count(*) from _t_users), coalesce(array_length(test_emails, 1), 0));
  report := report || format(E'agent sessions: %s\n', (select count(*) from _t_sessions));
  report := report || format(E'resolution runs: %s\n', (select count(*) from _t_runs));
  report := report || format(E'attachments: %s\n', (select count(*) from _t_attachments));
  report := report || format(E'devices: %s\n',
    coalesce((select string_agg(id::text || ' ' || hostname || ' (' || platform || ')', ', ')
              from _t_devices), 'none'));
  report := report || format(E'mock ai_provider_calls: %s\n',
    (select count(*) from public.ai_provider_calls where provider = 'mock'));
  report := report || format(E'tickets kept (resolved/closed, not test): %s\n',
    (select count(*) from public.tickets where id not in (select id from _t_tickets)));

  select string_agg(p, E'\n  ') into paths from (
    select storage_path p from _t_attachments where storage_path is not null
    union select quarantine_path from _t_attachments where quarantine_path is not null) s;
  report := report || E'storage paths to delete in ticket-attachments-private:\n  '
                   || coalesce(paths, '(none)') || E'\n';

  if coalesce(array_length(test_emails, 1), 0) = 0 then
    select string_agg(email, ', ') into cands from auth.users
    where email ~* '(test|e2e|bot|demo|example|mailinator|\+)';
    report := report || E'test_emails is empty. Candidate test accounts:\n  '
                     || coalesce(cands, '(none found)') || E'\n';
  end if;

  -- ---------- 3. disable guard triggers (only ones currently enabled) ----------
  create temp table _t_trg on commit drop as
    select c.relname as tbl, t.tgname as trg
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and not t.tgisinternal and t.tgenabled <> 'D';
  for r in select * from _t_trg loop
    execute format('alter table public.%I disable trigger %I', r.tbl, r.trg);
  end loop;

  -- ---------- 4. delete, children first ----------
  delete from public.capability_autonomy_outcomes
   where run_id in (select id from _t_runs) or agent_session_id in (select id from _t_sessions);
  get diagnostics n = row_count; report := report || format(E'deleted ladder outcomes: %s\n', n);

  delete from public.pilot_reviews
   where run_id in (select id from _t_runs) or ticket_id in (select id from _t_tickets);
  delete from public.shadow_decisions
   where run_id in (select id from _t_runs) or ticket_id in (select id from _t_tickets);

  delete from public.ticket_attachments where id in (select id from _t_attachments);
  delete from public.agent_sessions where id in (select id from _t_sessions);
  delete from public.resolution_runs where id in (select id from _t_runs);
  delete from public.devices where id in (select id from _t_devices);

  delete from public.tickets where id in (select id from _t_tickets);
  get diagnostics n = row_count; report := report || format(E'deleted tickets: %s\n', n);

  delete from public.ai_provider_calls where provider = 'mock';

  delete from public.record_exclusions x
   where (x.table_name = 'tickets'
          and not exists (select 1 from public.tickets t where t.id = x.record_id))
      or (x.table_name = 'resolution_runs'
          and not exists (select 1 from public.resolution_runs rr where rr.id = x.record_id));
  get diagnostics n = row_count; report := report || format(E'deleted exclusion rows: %s\n', n);

  -- ladder counters with no outcomes left were built from test runs only: zero them
  update public.capability_autonomy_stats s
     set live_runs = 0, verified_successes = 0, verify_failures = 0,
         rollback_failures = 0, security_incidents = 0, updated_at = now()
   where (s.live_runs + s.verified_successes + s.verify_failures
          + s.rollback_failures + s.security_incidents) > 0
     and not exists (select 1 from public.capability_autonomy_outcomes o
                     where o.organization_id = s.organization_id
                       and o.capability_id = s.capability_id);
  get diagnostics n = row_count; report := report || format(E'ladder stats reset: %s\n', n);

  -- ---------- 5. re-enable exactly the triggers we disabled ----------
  for r in select * from _t_trg loop
    execute format('alter table public.%I enable trigger %I', r.tbl, r.trg);
  end loop;

  report := report || format(E'tickets remaining: %s\n', (select count(*) from public.tickets));

  if dry_run then
    raise exception E'DRY RUN — nothing was changed. Set dry_run := false to apply.\n%', report;
  end if;

  insert into _cleanup_report select 'report', line
    from unnest(string_to_array(rtrim(report, E'\n'), E'\n')) line;
end
$cleanup$;

select detail as "cleanup applied" from _cleanup_report;
