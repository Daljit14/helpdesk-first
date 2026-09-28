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

## Local test recipe (browser paths)

The multi-hypothesis browser path requires the capabilities used by the mock
model to be enabled in the test environment:

```sh
HELP_DESK_CAP_DEVICE_FLUSH_DNS_ENABLED=true
HELP_DESK_CAP_DEVICE_RESET_WIFI_PROFILE_ENABLED=true
HELP_DESK_CAP_DEVICE_RESET_NETWORK_ADAPTER_ENABLED=true
HELP_DESK_PILOT_CAPABILITY_ALLOWLIST=device_flush_dns,device_reset_wifi_profile,device_reset_network_adapter
```

The requester organization also needs enabled rows in
`organization_capabilities` for all three capability IDs, with active mirrored
capability versions. Keep the existing requester-agent, autonomy, registry,
guardrails, pilot, and evidence settings enabled as described in
`SETUP-NOTES-C2.md`. These settings only prepare a local test environment;
they do not bypass registry, policy, consent, verification, or gateway checks.

## Findings

The autonomy attempts cap gates starting a new attempt, not verification of
the final permitted attempt. A run at `max_attempts` may therefore complete
its in-flight execution and enter verification; deadline and budget limits
remain enforced on every transition.

Requester-agent escalations now persist attempted action, independent
verification, and requester-feedback steps in `ticket_actions` before the
Diagnosis package is snapshotted, while mapping terminal reasons to handoff
categories including repeated-failure and security-concern outcomes.
