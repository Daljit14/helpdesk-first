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

## C1 semantics and deviations

C1 sessions remain `active` after every normal final answer. They never reach
`resolved`; resolution requires the later verifier and explicit requester
confirmation in C2. C1 also has no `abandoned` session behavior.

- D1: C1 exposes only four read-only tools; no requester action tool is
  registered.
- D2: Password reset remains an allowed L1 capability, while account unlock,
  MFA and recovery-method changes, privilege changes, security disabling,
  deletion outside temporary cleanup, installation, and display reset are
  denied.
- D3: Tool results are wrapped and bounded for the model, while deterministic
  short summaries are emitted and encrypted in the append-only step log.
- D4: Prior user and final messages are decrypted and bounded before being
  prepended to a subsequent model turn.
- D5: Prompt-injection, identity-target, denylisted-tool, kill-switch, budget,
  and invalid-output paths halt or escalate before any state-changing action.
- D6: Requester-agent evaluation uses an in-memory scripted model and injected
  loop dependencies; it does not connect to Supabase.
- D7: The evaluation benchmark version is incremented when requester-agent
  cases or release gates change.
- D8: The requester-agent Playwright project uses its own port and skips when
  requester credentials or `E2E_ORG_ID` are unavailable.
