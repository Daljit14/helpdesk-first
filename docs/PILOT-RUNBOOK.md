## Requester-agent actions

Keep `HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED` off until the organization
allowlist, first-party evidence, gateway policy, verification, rollback, and
audit checks are complete. During a pilot inspect consent, execution,
verification, rollback, and requester confirmation events. “Talk to a human”
remains available in every state; disable the action flag or use the kill
switch to stop execution.

## Requester agent C1 pilot

1. Apply `supabase/requester-agent.sql` after the prerequisite migrations.
2. Keep `HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED`,
   `HELP_DESK_REQUESTER_AGENT_AUTORUN_ENABLED`, and
   `HELP_DESK_REQUESTER_AGENT_VISION_ENABLED` false.
3. Set the global flag and allow one organization UUID.
4. Use the mock provider and exercise a Wi-Fi request, a human handoff, and
   a kill-switch halt while watching `agent_sessions` and `agent_steps`.
5. Disable the global flag or set the organization kill switch immediately if
   safety telemetry, rate limits, or escalation behavior is unexpected.

### Enabling external research for one organization

Keep `HELP_DESK_RESEARCH_ENABLED=false` globally until the provider key, budget, and
family configuration are reviewed. For a pilot, set the provider key and
`HELP_DESK_RESEARCH_FAMILIES=identity,network`, then use the organization readiness
card to confirm the provider is configured before enabling the feature.

# Controlled pilot runbook

This runbook enables autonomous execution for one organization only. Do not
change environment flags during an incident response without approval.

## Enable one organization

### Data protection

1. Set a unique base64-encoded 32-byte `HELP_DESK_MASTER_KEY` and
   `HELP_DESK_MASTER_KEY_ID`.
2. Set `HELP_DESK_ORG_ENCRYPTION_ENABLED=true`.
3. The Vercel Hobby cron runs the data-protection backfill daily at 03:00
   UTC and drains for up to approximately 50 seconds per run.
4. For faster draining, manually trigger it with:

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     https://<host>/api/cron/data-protection-backfill
   ```

   Repeat until the response reports `remaining: 0`.

5. Confirm pilot readiness reports `backfill 0 rows remaining`.
6. Optionally rotate the organization's DEK after backfill verification.

### Identity connector setup

For Entra, register an application with `User.Read.All`, optional
`AuditLog.Read.All`, `UserAuthenticationMethod.Read.All`,
`GroupMember.ReadWrite.All`, and `User.RevokeSessions.All`. For Google
Workspace, configure domain-wide delegation for
`admin.directory.user.readonly`, `admin.directory.user.security`, and
`admin.directory.group.member`. Configure verified organization domains and
allow-list group IDs before enabling group capabilities.

1. Confirm `HELP_DESK_GUARDRAILS_ENFORCED=true`.
2. Set `HELP_DESK_AUTONOMY_ORG_ALLOWLIST` to exactly one approved
   organization UUID.
3. Set `HELP_DESK_PILOT_CAPABILITY_ALLOWLIST` to the reviewed, low-risk
   capability IDs. Leave capabilities out until their registry versions are
   enabled and verified.
4. Confirm the Pilot readiness card reports no blockers.
5. Set `HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED=true` only after the first four
   steps are complete.
6. Verify the first execution, independent verification, audit event, and
   notification before allowing additional volume.

The allow-list is configured before the execution flag. A non-empty
organization allow-list and explicit capability allow-list are mandatory
pilot controls.

## Guardrails

The gateway enforces tenant binding, planner-output validation, capability
registry enablement, policy decisions, consent or technician approval,
idempotency, attempt and budget limits, concurrent-run limits, daily limits,
kill switches, breaker state, independent verification, rollback, and
redacted audit events.

## Pause procedures

- Global: disable execution and have a platform administrator enable the
  global kill switch.
- Organization: leave the organization kill switch enabled and remove the
  organization from the allow-list before investigation.
- Capability: disable the capability registry version and remove its pilot
  allow-list entry.
- Breaker: do not resume until the failed executions and verification results
  are understood. Automatic pilot pauses have a `pilot_auto_pause:` reason.

## Incident checklist

1. Disable autonomous execution.
2. Preserve the run, resolution events, execution, verification, and rollback
   identifiers.
3. Check tenant and idempotency keys.
4. Review alert delivery and audit redaction.
5. Capture the failing planner/policy/gateway event.
6. Confirm no cross-organization data was returned.
7. Escalate unsafe or incorrect outcomes to the organization admin and
   security owner.

## Weekly review

Review every pilot execution, verification outcome, pending/incorrect/unsafe
review, reopen rate, breaker state, daily-limit utilization, capability
allow-list, and benchmark report version. Record the review outcome and keep
the organization paused if evidence is incomplete.

## Rollback to off

Set `HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED=false`, keep any automatic pause
switch enabled, stop new pilot runs, and inspect unresolved runs. Resume only
after the incident owner confirms the guardrail and verification evidence.

## Device-agent operations

Keep `HELP_DESK_DEVICE_AGENT_ENABLED=false` until enrollment and organization
ownership are reviewed. When enabled, create a short-lived enrollment token
from `/admin/devices`, enroll the outbound agent, then have the requester use
`/devices/claim` with the agent's `claim-code`. Revoke devices immediately when
lost or compromised. Device execution remains off in B1; diagnostics and
shadow plans are review-only.

### Lease expiry and reclaim

Jobs have bounded leases. The resolution cron reclaims leased or TTL-expired
jobs into the terminal `expired` state and writes an append-only audit event.
Reclaim is not requeue: there is no retry-attempt model.

### Cancelling device jobs

Organization admins can cancel queued or leased jobs from `/admin/devices` or
the Resolution Center. Cancellation is audited and never deletes the job.

### Excluding test records

Organization admins can mark fixture tickets and resolution runs as test data.
Excluded records remain present for audit but are omitted from operational
metrics, queues, learning, and exports by default.
