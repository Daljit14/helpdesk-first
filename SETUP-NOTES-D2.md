# D2 — read-only device diagnostics

D2 adds camera privacy, microphone privacy, and stale credential diagnostics
to the existing device-agent catalog and collectors. It does not add a feature
flag, environment variable, or SQL migration. The existing
`device_diagnostics.kind` column is `text not null` without a check constraint,
so the new diagnostic kinds fit the current schema.

## Agent rollout

Deploy the server catalog/evidence update together with an updated device-agent
build. Updated agents periodically collect `camera_privacy`, `mic_privacy`, and
`credential_health` and can run their matching read-only catalog actions.
Older agents do not know the new action IDs and return `unknown_action` if
leased one; their periodic uploads omit the new diagnostic kinds, so D2
hypotheses remain unavailable until the agent is upgraded. The server does not
infer or fabricate missing results.

The diagnostics contain only access enums, booleans, counts, and `null`.
Windows may report counts of stored credentials and expired Kerberos tickets;
macOS and Linux do not inspect their keychains/keyrings. No device names,
credential targets, usernames, realms, or principals are returned.

## Registry and enablement

Use the existing capability-registry synchronization cron after deploying the
catalog. Synchronization creates/refreshes the capability definitions but
does not enable them. Keep the new capabilities disabled until an organization
explicitly enables them through the existing organization capability flow.
The actions are read-only, use no snapshot, and require no requester consent;
existing device-agent kill switches and rollout controls remain unchanged.

There is no D2 SQL to apply and no new setting to add to `.env`. The existing
device-agent configuration remains off by default.
