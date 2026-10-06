# G1 — blast-radius limits and automatic safety stops

G1 bounds hourly autonomy activity and can automatically pause a capability
when recent failures exceed a configured count or rate. Automatic stops are
disabled by default.

Set `HELP_DESK_BLAST_RADIUS_ENABLED=true` to enable the default five-failure,
30-minute window and hourly defaults. Override the failure threshold, rate,
window, organization hourly limit, or device limit with the six G1 environment
variables in `.env.example`. Apply `supabase/blast-radius.sql` after reviewing
the indexes; this SQL adds no tables and is not applied automatically.

## Preview

For a local preview, set:

```text
HELP_DESK_BLAST_RADIUS_ENABLED=true
HELP_DESK_BLAST_RADIUS_FAILURES=2
HELP_DESK_BLAST_RADIUS_WINDOW_MINUTES=5
```

After two failed capability executions in five minutes, G1 sets a
`blast_radius:` capability switch, records a `blast_radius.tripped` event, and
sends a `blast_radius_tripped` alert for affected organizations. The active
stop appears in **Admin → Resolution Center → Guardrails**. Platform admins can
clear it there; the clear action records `blast_radius_cleared`.

To roll back the rollout, set `HELP_DESK_BLAST_RADIUS_ENABLED=false` and restart
the application. Explicit hourly limits remain enforced when configured; clear
existing automatic stops from the guardrails panel before re-enabling autonomy.
