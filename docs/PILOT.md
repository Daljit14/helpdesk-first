# Controlled autonomy pilot

Production execution remains off until the pilot is explicitly approved.

## Turn-on runbook

1. Set `HELP_DESK_AUTONOMY_ORG_ALLOWLIST` to the approved organization IDs.
2. Set `HELP_DESK_PILOT_CAPABILITY_ALLOWLIST` to the approved low-risk capability IDs.
3. Flip `HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED=true`.
4. Verify the Pilot tab in the AI Resolution Center and confirm daily limits,
   review backlog, verification pass rate, and pause state.

## Weekly capability review

- Review every capability's execution count and verification pass rate.
- Review pending, incorrect, and unsafe pilot reviews.
- Confirm no organization or capability was added outside the change process.
- Check reopen rate and recent auto-pause triggers.
- Confirm the global and organization daily limits remain appropriate.

## Pause and resume

Unsafe reviews, rapid reopens, daily limits, and breaker openings automatically
pause the organization. An organization admin may resume only a switch whose
reason starts with `pilot_auto_pause:` from the Pilot tab. Investigate the
trigger before resuming.

## Rollback

Set `HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED=false` immediately. Existing runs
must be reviewed and any active organization switch left paused until the
incident is understood.

## SQL

`supabase/autonomy-pilot.sql` is additive migration SQL. **Apply on merge**;
it was not applied during this implementation.
