## External research

Optional external research is disabled by default. When enabled for an allow-listed
identity or network family and a low-confidence diagnosis, deterministic queries may
consult Tavily or Brave. Results remain untrusted, are guarded before planner input,
and can only adjust evidence confidence or require consent.

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

## Device jobs

Device capabilities use the same registry, policy, gateway, verification, and
rollback pipeline. A handler binds each job to its organization, device, run,
step, capability version, execution, and parameter hash before enqueueing it.
Agents lease only queued, unexpired jobs for their own device and report
schema-validated, redacted results.

Read-only jobs collect the required diagnostics. Local-write jobs never mutate
devices in B2: shadow mode reports what would run and stores a preview snapshot,
while execute mode reports `unsupported`. `device_job_completed` requires fresh
post-diagnostics and does not resolve a run from a shadow result. A rollback
requires the original snapshot hash and enqueues a `rollback` job bound to the
original job.

Device consent follows three rules: read-only actions never prompt, irreversible
actions always require user consent, and reversible local-write actions require
consent unless an organization administrator has preapproved the matching
device class and category. Global, organization, and capability kill switches
prevent polling and cancel queued jobs.
