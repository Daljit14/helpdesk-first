# D5 setup notes: organization environment profile

D5 is implemented behind the default-off
`HELP_DESK_ORG_ENVIRONMENT_ENABLED` flag. Set it to `true` only after applying
`supabase/org-environment-profile.sql` and verifying organization-admin access.
The migration is additive and idempotent; it has not been applied to any
database. Apply it after `wave-3-organizations.sql` and `investigation.sql`.

## Organization profile

An organization admin can open **Admin → Environment profile**, review the
bounded suggestions from active enrolled devices and their latest printer
diagnostics, and use those suggestions to prefill the form. Prefill only
changes the client form. Saving writes a draft and clears any previous
confirmation; the profile is not used by the assistant until an organization
admin confirms it. Saves and confirmations are recorded as
`org_environment.saved` and `org_environment.confirmed`.

The ticket-triage clarifier can skip `which-platform` only when the profile
contains exactly one standard platform other than `Other`. It can skip
`account-managed` when an email stack is set. These organization-profile
answers are internally sourced and do not count toward the requester
clarification limit.

## Requester agent and safety

When enabled, the requester agent has the research-only
`get_org_environment` tool. Its output is untrusted organization-entered data:
it can inform troubleshooting and standard-platform guide selection, but it
cannot authorize or independently support an action. If no confirmed profile
is available or the lookup fails, the assistant continues without profile
answers and asks the questions it otherwise would.

The anonymous `/api/ai/intake` route has no organization context and is
unchanged.

## Clarification metric

When the flag is enabled, the Resolution Center shows the average number of
distinct clarification question IDs per ticket. Question IDs are deduplicated
across that ticket's investigation turns in the selected time window, and the
average includes only non-excluded tickets with at least one investigation
turn. The displayed ticket count is the denominator. A missing
`ticket_investigation_turns` table is treated as no metric data; other query
errors still fail the metric load. With the flag off, the loader makes no
investigation-turn query and the tile is hidden.

To roll back, set `HELP_DESK_ORG_ENVIRONMENT_ENABLED=false`. The migration may
remain unapplied or the profile table may remain in place; no profile is read
while the flag is off.
