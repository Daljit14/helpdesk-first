# AI autonomy guardrails

PR #71 adds a provider-neutral safety boundary around autonomous planning and
execution. Autonomous execution remains disabled unless
`HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED=true`, and startup fails closed when
`HELP_DESK_GUARDRAILS_ENFORCED=false`.

## Threat model

Ticket text, comments, events, attachment names/metadata, diagnostic answers,
knowledge, and provider output are untrusted. The system must prevent prompt
injection, secret leakage, cross-organization access, unsafe capability
selection, replay, uncontrolled retries, unverified resolution, and silent
provider degradation.

## Controls

1. **Input boundary** — `lib/autonomy/guardrails/input.ts` redacts learning
   secrets, cards, tokens, classifies safety, labels all fields untrusted, and
   bounds model input.
2. **Planner output** — `lib/autonomy/guardrails/planner-output.ts` validates
   strict, ticket-bound planner v2 output and rejects executable content.
3. **Tenant isolation** — executor tenant checks, organization-scoped reads,
   capability enablement, and gateway ticket ownership checks.
4. **Policy** — `lib/autonomy/policy/engine.ts` applies deny-first precedence,
   capability status, evidence conflict, platform, sensitivity, consent, and
   breaker rules.
5. **Gateway** — `lib/autonomy/guardrails/gateway.ts` is the only production
   handler import boundary and enforces flags, switches, breaker, policy,
   parameters, attempts, concurrency, budget, idempotency, timeout, output
   sanitization, and persistence.
6. **Consent** — `lib/autonomy/guardrails/consent.ts` binds approval to user,
   organization, ticket, run, capability/version, parameters, risk, expiry,
   and one-time consumption.
7. **Limits** — `lib/autonomy/config.ts` bounds attempts, runtime, budget,
   planner input, provider calls, concurrency, and daily run settings.
8. **Verification** — `lib/autonomy/verification/engine.ts` independently
   verifies objective outcomes and requester confirmation before resolution.
9. **Rollback** — `lib/autonomy/rollback/engine.ts` supports compensating
   handlers and always escalates after failed verification.
10. **Kill switches** — `lib/autonomy/kill-switches.ts` supports global,
    organization, capability, and provider scopes plus environment overrides.
11. **Breaker and alerts** — `lib/autonomy/breaker.ts` persists closed/open/
    half-open state; `lib/autonomy/alerts.ts` notifies organization admins.
12. **Audit** — `lib/autonomy/audit/versions.ts`,
    `lib/autonomy/guardrails/events.ts`, and `writeRunEvent` attach immutable
    guardrail/policy/capability provenance and redacted detail.

## Event catalogue

`guardrail.input_redacted`, `guardrail.prompt_injection_detected`,
`guardrail.output_rejected`, `guardrail.tenant_mismatch`,
`guardrail.capability_unknown`, `guardrail.policy_denied`,
`guardrail.consent_required`, `guardrail.approval_required`,
`guardrail.consent_rejected`, `guardrail.rate_limited`,
`guardrail.kill_switch_blocked`, `guardrail.breaker_open`,
`guardrail.verification_missing`, `guardrail.execution_disabled`, and
`guardrail.execution_allowed`.

## Configuration

```text
HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED=false
HELP_DESK_GUARDRAILS_ENFORCED=true
HELP_DESK_AUTONOMY_MAX_CONCURRENT_PER_ORG=2
HELP_DESK_AUTONOMY_MAX_RUNS_PER_USER_PER_DAY=5
HELP_DESK_AUTONOMY_MAX_RUNS_PER_ORG_PER_DAY=50
HELP_DESK_AUTONOMY_MAX_PLANNER_INPUT_CHARS=8000
HELP_DESK_AUTONOMY_MAX_PROVIDER_CALLS_PER_RUN=3
```

The supplied `supabase/autonomy-guardrails.sql` migration is intentionally not
applied by development agents. Apply it after merge through the normal schema
review process.

## Verification report

| Check                                      | Result                     |
| ------------------------------------------ | -------------------------- |
| `npx vitest run lib/autonomy app/api/cron` | 38 files, 215 tests passed |
| `npm run lint`                             | Passed                     |
| `npm run typecheck`                        | Passed                     |
| `npm run format:check`                     | Passed                     |
| `npm run build`                            | Passed                     |

## Roadmap

PR #71 guardrails is followed by #72 benchmark/shadow, #73 controlled pilot,
#74 hardening, #75 production L1, and #76+ endpoint-agent work.
