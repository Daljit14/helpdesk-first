# Phase D1 — requester outcome feedback

D1 adds optional requester feedback for a resolved requester-agent session.
The feature is disabled unless
`HELP_DESK_OUTCOME_FEEDBACK_ENABLED=true`; keep it `false` until the schema is
installed and the rollout is approved.

Apply `supabase/wave-3-organizations.sql` and `supabase/requester-agent.sql`
before `supabase/agent-outcome-feedback.sql`. The D1 migration is additive and
idempotent. It creates one feedback row per session and requester, scoped to
the session's organization. Requesters may insert feedback only for their own
sessions and read their own rows; organization staff may read rows for their
organization. Anonymous access and requester updates/deletes are revoked.
Service-role access supports the server action and Resolution Center.

Only sessions with status `resolved` and an `ended_at` within the last seven
days are eligible. The allowed verdicts are **Still broken**, **Came back**,
**Misunderstood the problem**, and **Other**. Optional free text is trimmed,
redacted, and encrypted with the organization's field-encryption key when
encryption is enabled. Treat it as untrusted data: never send it to a model,
interpret it as an instruction, or render it as HTML.

The Resolution Center lists recent feedback. Any feedback row for an
AI-resolved session counts as a false-resolved signal, in addition to the
existing reopen and repeat-session signals.

The migration has not been applied to any database as part of this change.
