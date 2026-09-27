# Requester-agent C2 action controls

Requester-agent state-changing actions are disabled unless both
`HELP_DESK_REQUESTER_AGENT_ENABLED=true` and
`HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED=true` are set, and the requester’s
organization is in `HELP_DESK_REQUESTER_AGENT_ORG_ALLOWLIST`.

The model can only propose an action. The server validates the capability,
rejects target-bearing parameters and denylisted capabilities, checks
first-party evidence, and runs the existing policy, consent, gateway,
verification, and rollback pipeline. Read-only and research evidence cannot
authorize an action.

An approved action is verified independently. A passing persisted verification
result is required before the requester can confirm resolution. Confirmation
is explicit; a “no” response records feedback and either permits another
hypothesis or escalates after the bounded failure limit.

Action consent expires after five minutes. Daily action counts are bounded by
`HELP_DESK_REQUESTER_AGENT_USER_DAILY_ACTIONS` (default `10`), and verification
waits up to `HELP_DESK_REQUESTER_AGENT_VERIFY_TIMEOUT_MS` (default `90000`).
All defaults remain safe and disabled.

For action enablement prerequisites, including capability registry and
organization configuration, see [SETUP-NOTES-C2.md](../SETUP-NOTES-C2.md).
