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

## Prerequisites for actions

Before testing a C2 action, configure every layer of capability enablement:

- Set `HELP_DESK_AUTONOMY_ENABLED=true`. This is the autonomy master switch;
  when it is off, the agent turn is halted by the `kill_switch` guard and
  cannot proceed to action consent.
- Set `HELP_DESK_CAPABILITY_REGISTRY_ENABLED=true`.
- Enable the specific capability with its derived environment flag, for
  example `HELP_DESK_CAP_DEVICE_FLUSH_DNS_ENABLED=true` for
  `device_flush_dns`.
- Populate the capability mirror by calling
  `/api/cron/capability-registry-sync` with a `Bearer $CRON_SECRET`
  authorization header. The sync populates the `capabilities` and
  `capability_versions` tables; the capability version must be `active`.
- Add an `organization_capabilities` row for the requester organization and
  capability with `enabled=true` and a compatible `min_version` (at least the
  capability version required by the action). The table also records
  `organization_id`, `capability_id`, `enabled_by`, and `enabled_at`.
  There is currently no admin UI for managing these rows; use reviewed SQL or
  trusted server-side administration.
- For `device_*` actions, the requester must have an active claimed device.
  The device lookup is organization- and requester-scoped and requires
  `devices_public.status='active'` with the requester as `user_id`.

For an authenticated browser check, provide `USER_E2E_EMAIL`,
`USER_E2E_PASSWORD`, and `E2E_ORG_ID`, then run:

```sh
npx playwright test --project=requester-agent tests/e2e/v2/agent.spec.ts
```

The test project runs on port 3101 and is skipped when credentials or the
organization identifier are unavailable.
