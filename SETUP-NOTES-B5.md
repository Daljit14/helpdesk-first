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

## Verification SQL

```sql
select id,status,error,result->>'reclaimed_at'
from device_jobs
where id='0559be6c-24bb-4bef-ab59-0f9ce1f1b857';

select action,target,created_at
from operations_audit
where target like 'job:0559be6c%'
order by created_at;

select table_name,record_id,reason
from record_exclusions
where organization_id='00000000-0000-0000-0000-000000000001';
```

Reclaim runs automatically on the next agent poll or
`/api/cron/resolution-runs`. It can also be run manually in the SQL editor:

```sql
select * from public.reclaim_expired_device_jobs();
```

The function writes its own audit rows.

## Not covered

- There is no DB-seeded Playwright coverage for admin cancellation or shadow
  activity.

The existing “requeue once” requirement cannot be implemented without an attempts/retry
model. B5 deliberately keeps the settled `leased -> expired` transition.
