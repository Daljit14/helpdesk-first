# Phase C1 requester agent

Apply `supabase/requester-agent.sql` after the existing organization, ticket,
encryption, and ticket-workflow migrations. The migration is not applied by
the application and must be reviewed before production use.

Set `HELP_DESK_REQUESTER_AGENT_ENABLED=true` and add organization UUIDs to
`HELP_DESK_REQUESTER_AGENT_ORG_ALLOWLIST` only for a watched pilot. The
actions, autorun, and vision flags remain false in C1. The C1 agent has no
state-changing tool: it can search approved guides, read stored device
diagnostics, read the requester's own account status, and read the
requester's own ticket history.

Use `HELP_DESK_AI_PROVIDER=mock` for deterministic validation. A Wi-Fi
message exercises guide search, stored diagnostics, and a final answer.
`POST /api/ai/agent` is a POST SSE stream and can be halted with the
organization kill switch. All sessions and steps are organization-scoped,
append-only, bounded, and encrypted when organization encryption is enabled.

Research and live device collection are deferred to C2. Actions, consent,
verification, rollback, and autorun are deferred to later phases.
