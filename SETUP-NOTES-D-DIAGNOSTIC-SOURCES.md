# PR 14 diagnostic sources

The requester-agent tools `get_recent_sign_in_failures` and
`count_similar_org_issues`, including their prompt guidance, are disabled by
default. Set `HELP_DESK_AGENT_DIAGNOSTIC_SOURCES_ENABLED=true` only after
reviewing the organization and connector permissions. The flag must remain
false by default in `.env.example`.

## Ticket indexes

`supabase/diagnostic-sources.sql` adds organization-scoped indexes for the
approved issue and AI-recommended issue ticket counts. The migration is
idempotent and is authored but has not been applied. It depends on
`ai_recommended_issue_id`, which is added by
`supabase/resolution-tracking.sql`.

## Sign-in failure source

Entra sign-in failures require the connector's `AuditLog.Read.All` permission;
the permission is listed in `docs/PILOT-RUNBOOK.md`. The tool returns only
mapped reason names and timestamps from the prior 24 hours. Google Workspace
is unsupported because its connector does not have sign-in audit scope.

## Device capability

`device_recent_error_events` is a read-only, shadow-mode diagnostic and needs
no new feature flag. Synchronize the device catalog, then enable this
capability only for the intended organizations using the existing per-org
device capability controls. Results are bounded to counts, allowlisted
application display names, and a timestamp; raw event messages and identifying
paths or names are not returned.

## Deferred checks

`run_read_only_check` is deferred because diagnostics are already uploaded
every 300-second poll and device jobs require both a resolution run and a
ticket. A live check therefore cannot be fresher without a protocol change.
Browser checks are deferred to PR 13, which owns reuse of
`lib/network-check.ts`.
