# C3 setup notes

1. Apply the existing requester-agent, capability-registry, autonomy,
   verification, rollback, and breaker migrations.
2. Apply `supabase/autonomy-ladder.sql`.
3. Configure the default-off requester-agent and capability flags in
   `.env.example`.
4. Enable the organization and capability rows, then leave the ladder at
   `consent` while collecting live-run evidence.
5. An organization admin may promote an eligible, snapshot-reversible
   capability to `autorun` from the Devices or Resolution Center ladder.

Session consent is capability-scoped, session-bound, revocable, and expiring.
It never bypasses policy or verification. If an automatic demotion occurs,
pause autorun, inspect the transition reason and rollback/verification records,
and resolve the underlying issue before a new human-admin promotion.

The device agent polls every 300 seconds. Restart it immediately before
autorun tests; otherwise verification may be inconclusive.
