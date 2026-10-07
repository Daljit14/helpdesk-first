# E3 — honest autonomy metrics and abandoned sessions

E3 adds organization-scoped Metrics v2 alongside the unchanged v1 fields,
honest-metric checks for autorun promotion, and a bounded stale-session
abandonment sweep. The sweep is disabled by default. Keep
`HELP_DESK_AGENT_ABANDON_SWEEP_ENABLED=false` until the migration and staged
verification are complete.

## Migration and flags

Apply `supabase/agent-session-abandon.sql` after
`supabase/agent-taint.sql` and before `supabase/audit-chain.sql`. It extends
the existing `agent_steps_kind_check` with `abandoned` and adds a partial
index for active sessions. The migration is authored but has not been applied
to production; its rollback block removes the index and restores the previous
step-kind list.

Configure:

- `HELP_DESK_AGENT_ABANDON_SWEEP_ENABLED=false` to keep the sweep off; set to
  `true` only after review and staged verification.
- `HELP_DESK_AGENT_ABANDON_MINUTES=60`; the value is clamped to 15–1440, and
  non-numeric input falls back to 60.
- `CRON_SECRET` for the cron bearer authorization, as with the other cron
  routes.

The Vercel schedule is `45 4 * * *` (04:45 UTC). The route returns
`{ "skipped": true }` while the flag is off, sets `Cache-Control: no-store`,
and returns a server error if the sweep fails.

## Staged end-to-end verification

1. Apply the migration in a non-production environment after its prerequisites.
2. Leave the sweep flag off and call
   `/api/cron/agent-sessions-abandon` with the configured bearer secret;
   confirm it returns the skipped response.
3. In staging, create or identify an active test session whose `updated_at` is
   older than the cutoff, with no pending approval, newer user turn, unfinished
   action, or unresolved consent/step-up request.
4. Enable the flag in staging and call the route with the same authorization.
   Confirm the response counts, the session is abandoned, its summary decrypts
   to `abandoned_no_user_turn`, and a later `abandoned` step records the
   configured inactivity duration. Confirm tickets, escalation tickets, and
   resolution runs were not changed.
5. Confirm a recent user turn, pending approval, unfinished action, or
   unresolved consent request is skipped. Disable the flag after testing.
6. View the organization-scoped Resolution Center card and confirm its Metrics
   v2 values and the v1 comparison line render for the test organization.

Do not use a production requester session to test abandonment. The update is
conditional on the session's observed status and `updated_at`; a concurrent
turn wins the race and is skipped.

## Metrics and promotion

`docs/METRICS.md` defines both versions, outcome precedence, repeat windows,
exclusions, breakdowns, the sweep, and promotion rules. Metrics v2 uses
organization-scoped tickets, feedback, actions, steps, report tickets, device
jobs, and `record_exclusions`; missing `device_jobs` is tolerated. Metrics v1
remains available for one release.

Autorun promotion keeps its existing verified-execution requirements and now
also refuses capabilities with later staff touches or a false-resolved rate
above the configured limit. If honest metrics cannot be loaded, promotion
fails closed with `Honest metrics are unavailable.`.
