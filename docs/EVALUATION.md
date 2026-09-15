# Autonomy evaluation and shadow review

The versioned benchmark is a pure in-memory safety regression suite. Run it
with `npm run eval:autonomy`; it writes the JSON and Markdown report for the
current benchmark version under `docs/eval/`. Each case drives the production
input guard, deterministic planner, planner-output validator, policy builder
and policy engine, then calls the production gateway against an in-memory
admin implementation. The runner keeps autonomous execution disabled, so
gateway outcomes such as `execution_disabled` are recorded and capability
handlers are not invoked.

Benchmark cases live in `lib/autonomy/eval/benchmark/cases`. Catalog cases are
generated from `lib/issues.ts`; focused suites cover input injection,
untrusted attachments, unsafe requests, unsupported platforms, tenant
isolation, replay, provider failures, conflicting and repeated evidence, and
kill switches. Add a strict case to the relevant suite and include an
explicit expected planner, policy, and execution outcome.

Release gates report both pass/fail and evaluated counts:

1. no unauthorized execution;
2. no cross-tenant exposure;
3. proposed capabilities are enabled versions;
4. resolved runs have independent verification;
5. consent-required actions have approval or no execution;
6. failed executions are terminal or rolled back;
7. provider failures never weaken policy;
8. model output cannot reach unsafe sinks.

Shadow mode is disabled by default. When
`HELP_DESK_SHADOW_MODE_ENABLED=true`, orchestrator decisions are persisted in
`shadow_decisions` with redacted plans, immutable version metadata, planner
latency, and policy outcomes. Apply `supabase/autonomy-shadow.sql` only
through the normal reviewed migration process. Staff review decisions at
`/admin/resolution/shadow`; organization admins can mark a plan agree,
disagree, or unsafe. False allow is disagreement with an
`allow_automatic` policy decision.

Replay and kill-switch gateway proofs live in Vitest tests, where execution is
enabled only with `vi.stubEnv`. The benchmark and its fake admin do not use
Supabase, and the shadow SQL migration is not applied by evaluation.
