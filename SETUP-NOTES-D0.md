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
