# Phase D0 — requester-agent outcome metrics

D0 has no feature flags and requires no SQL migration. The Resolution Center
card derives organization-scoped metrics from existing requester-agent,
ticket, and audit tables. It defaults to a 30-day window and renders an empty
state until the organization has completed requester-agent sessions.

The metrics show:

- ended requester-agent sessions and the share resolved without a staff touch;
- false resolutions detected by a reopened backing ticket or a subsequent
  same-requester session with overlapping guide results;
- escalations and their normalized reasons;
- median AI and human resolution times; and
- recent sessions whose searches returned no guides and proposed no action.

Record exclusions apply to both the backing and escalation ticket for a
session. Excluded sessions are omitted for support staff and org admins unless
an org admin selects **Show excluded** in the Resolution Center. The card
otherwise uses the same organization and exclusion boundaries as the rest of
the page.

## CI secrets

The `requester-agent-e2e` GitHub Actions job requires these repository secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `USER_E2E_EMAIL`
- `USER_E2E_PASSWORD`
- `E2E_ORG_ID`

The requester user must be a `requester` member of the organization identified
by `E2E_ORG_ID`. The job skips when these secrets are unset.
