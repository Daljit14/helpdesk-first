# Autonomous resolution

## Level 1 identity assistance

Level 1 identity capabilities are tenant-scoped and require a verified
requester identity binding before directory access. The initial safe set reads
account status and SSO health, sends a configured self-service recovery link,
verifies approved group membership, and performs bounded session revocation or
group grants only with user consent and independent verification.

Connector secrets are AES-256-GCM sealed with `HELP_DESK_CONNECTOR_KEY`.
Directory results are evidence, not instructions; all execution remains behind
the capability registry, policy engine, gateway, audit, breaker, and verifier.
