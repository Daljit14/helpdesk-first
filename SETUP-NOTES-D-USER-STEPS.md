# PR 16 setup notes: requester "Your step" cards

Requester-agent user steps are disabled by default with
`HELP_DESK_AGENT_USER_STEPS_ENABLED=false`. The feature uses the additive
`supabase/agent-user-steps.sql` migration, which is authored but has not been
applied to any database. Apply the migration through the normal reviewed
database-change process before enabling the flag.

## Safe guide steps

When enabled, the requester agent may offer one instruction from a
guide approved for the session's organization. The instruction and source link
are derived from that guide's current step policy, not from model-provided
text. Only requester-offerable steps are eligible. Credential requests,
security-tool disablement or removal, unapproved software installation, unsafe
reasons, and URLs in the reason are blocked. Confirmed organization software
may be referenced where applicable.

Offering a step is not an action: it creates no action proposal or execution
request, and it does not create evidence. An active service incident does not
prevent a safe user step from being offered. Requesters can report that they
completed the step, that it did not work, or that they cannot do it. These
outcomes are persisted in the append-only agent-step history; only "Didn't
work" marks the next turn as a failed verification.

## Escalation and pending steps

At escalation, staff ticket actions include the guide-derived instruction,
source, and any requester outcome. Pending steps are saved and a notification
is queued with subject **A step to try from your support chat**. The daily
`/api/cron/agent-user-steps` sweep checks active sessions idle for more than
30 minutes (at most 100 sessions per run), saves any still-pending step before
creating its ticket action and notification, and leaves session status
unchanged. Configure the normal `CRON_SECRET` for authenticated cron access.

## Rollout and rollback

Keep the flag off until the migration is applied and approved-guide content has
been reviewed. Enable only with the exact value `true`. When disabled, the
agent does not advertise the tool and user-step outcome requests return 404.
To roll back, set `HELP_DESK_AGENT_USER_STEPS_ENABLED=false`; previously
recorded audit rows and notifications are retained.
