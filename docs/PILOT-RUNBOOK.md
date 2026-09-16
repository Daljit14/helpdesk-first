# Controlled pilot runbook

This runbook enables autonomous execution for one organization only. Do not
change environment flags during an incident response without approval.

## Enable one organization

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
