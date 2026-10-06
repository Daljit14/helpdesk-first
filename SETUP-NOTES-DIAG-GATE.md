# Diagnostic-tools read-only release gate

This change adds no feature flag, SQL migration, or environment variable.
Requester diagnostic tools remain controlled by the existing
`HELP_DESK_AGENT_DIAGNOSTIC_SOURCES_ENABLED` flag, which is off by default.

The `diagnostic_tools_read_only` release gate applies to requester-agent
diagnostic-source benchmark suites. It fails if a case executes a capability,
calls a handler, or records a diagnostic action attempt. The runner also marks
an attempt when a diagnostic suite makes a side-effect, execution-plan, or
proposed-action call, or includes a case-forbidden string in model input.

`get_recent_sign_in_failures` shapes sign-in data to a 24-hour window and at
most five `{ at, reason }` entries. `count_similar_org_issues` exposes only
counts: its query is scoped to the current organization, excludes the
requester, and uses a head-only exact count. Neither tool returns matching
requester identifiers or ticket rows.

For `recent_error_events`, server-side sanitization keeps only finite,
non-negative diagnostic counts (or `null`), a valid short timestamp, and
approved application display names. It drops all other data and replaces the
agent-provided summary with a count-only summary. Sanitization runs both before
diagnostic records are stored and when records are loaded as evidence, so
older stored rows are also filtered before reaching the requester agent. Other
diagnostic kinds retain their existing summary and data.

The G1 follow-up best-effort records a `blast_radius.check_failed` audit event
with only the failing check stage when a check encounters a query error or a
switch update fails. It does not change G1 thresholds or defaults.
