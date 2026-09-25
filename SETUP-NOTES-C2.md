# Requester-agent C2 setup

Requester actions remain disabled by default. Enable the read-only requester
agent with `HELP_DESK_REQUESTER_AGENT_ENABLED=true`, then separately enable
consent-gated actions with `HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED=true`
and restrict both to an organization allowlist.

Apply `supabase/requester-agent.sql` after the C1 schema. Re-running the SQL
is safe because the migration uses additive, guarded DDL. Do not apply it to a
production project without the normal migration review and backup procedure.

C2 actions require persisted plan-step provenance, approval expiry (five
minutes), first-party evidence, gateway policy evaluation, verification,
rollback, and requester confirmation. The backing ticket uses the requester
platform and skips automatic triage and new-ticket notifications.

For an authenticated browser check, provide `USER_E2E_EMAIL`,
`USER_E2E_PASSWORD`, and `E2E_ORG_ID`, then run:

```sh
npx playwright test --project=requester-agent tests/e2e/v2/agent.spec.ts
```

The test project runs on port 3101 and is skipped when credentials or the
organization identifier are unavailable.
