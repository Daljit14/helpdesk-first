# D0 local test recipe

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
