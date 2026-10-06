# E1a — identity assurance and step-up

Identity assurance is disabled by default. Keep
`HELP_DESK_IDENTITY_ASSURANCE_ENABLED=false` until the migration, provider
attestations, and rollout have been reviewed. Fresh authentication defaults to
10 minutes and is clamped to 1–60 minutes with
`HELP_DESK_IDENTITY_ASSURANCE_FRESH_MINUTES`.

## Migration order

Apply `supabase/identity-assurance.sql` after
`supabase/requester-agent.sql`, `supabase/org-environment-profile.sql`, and
`supabase/agent-reply-guard.sql`, and before `supabase/audit-chain.sql`. The
migration has not been applied to production.

## Assurance and step-up

Email and API channels are A0; ticket-owner web contexts are A1. A fresh
verified first-factor sign-in is A2. A3 requires either a recent Supabase MFA
claim or a fresh OAuth first factor matching exactly one provider on a
confirmed organization profile that attests MFA is enforced for every sign-in.
The admin checkbox is an organization attestation; only confirmed profiles
count.

Azure/Entra step-up requests a fresh OAuth round trip with `prompt=login` and
`max_age=0`. Google step-up performs an OAuth round trip, but the reviewed
Google OIDC documentation does not document a forced-reauthentication
parameter, so Google freshness does not qualify for IdP-attested A3. Password
users return to the login form with a “Confirm it's you” heading. After
confirmation, return to chat and press Continue; pending consent remains
unconsumed until assurance is sufficient.
References: [Google OpenID Connect reference](https://developers.google.com/identity/openid-connect/reference)
and [OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

The current assurance contract does not bind authentication to an enrolled
device. Enrolled-device binding is a follow-up.

## Browser-test plan

When browser testing is authorized, cover signed-out and signed-in redirects,
Azure and Google provider round trips, password reauthentication while already
signed in, step-up completion without auto-closing the tab, and chat Continue
with and without a pending consent card. This change was not browser-tested.
