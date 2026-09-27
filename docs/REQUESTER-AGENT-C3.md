# Requester-agent C3 autonomy ladder

C3 adds a per-organization, per-capability ladder:

`disabled → shadow → consent → autorun`

The ladder remains off by default. An enabled organization capability without a
ladder row uses the C2 `consent` behavior; a missing organization capability
uses `shadow`.

## Promotion and demotion

Only an authenticated organization admin can promote a capability to
`autorun`. Promotion is audited and requires the configured live-run and
verified-success thresholds, zero rollback failures and security incidents,
and a snapshot restore handler. Runtime code never promotes a capability.

Autorun automatically demotes to `consent` after a rolling-window failure,
rollback failure, security incident, or open capability breaker. The
transition and reason are retained for staff review. Apply
`supabase/autonomy-ladder.sql` after the existing requester-agent and
capability migrations.

## Session consent

When autorun is available, the requester sees:

> Allow the assistant to apply safe, reversible fixes during this session?

The grant is bound to the active session, captures the covered capability
snapshot, expires after `HELP_DESK_REQUESTER_AGENT_SESSION_CONSENT_TTL_MS`,
and can be revoked. Revocation blocks new autorun actions but does not cancel
an action already in flight. The policy engine, tenant checks, kill switches,
breakers, verification, rollback, and requester confirmation remain
authoritative.

## Verification

Keep `HELP_DESK_REQUESTER_AGENT_AUTORUN_ENABLED=false` until the ladder has
been reviewed by an organization admin. Run the C3 ladder tests and the
requester-agent regression suite, then inspect transition history and
automatic-demotion alerts during pilot operation.
