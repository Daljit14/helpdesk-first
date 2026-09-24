# Phase B5 setup notes

Apply migrations in this order:

1. `supabase/device-jobs.sql`
2. `supabase/record-exclusions.sql`
3. `supabase/ticket-workflow.sql`

Do not apply these files to production without a reviewed migration window.

## Verification checklist

- Confirm the `0559be6c` job is `expired` with error `lease_expired`.
- Confirm its audit row has action `device.job_reclaimed`.
- Confirm both B5 fixture IDs exist in `record_exclusions` after migration.
- Confirm excluded fixtures are absent from Operations and Resolution Center by default.
- Confirm `showExcluded=1` is available only to organization admins.
- Revoke a device with queued or leased jobs and confirm the jobs become `expired`.
- Cancel a queued or leased job from Devices and confirm the append-only audit row.
- Run the reclaim RPC twice and confirm the second call returns no rows.

The existing “requeue once” requirement cannot be implemented without an attempts/retry
model. B5 deliberately keeps the settled `leased -> expired` transition.
