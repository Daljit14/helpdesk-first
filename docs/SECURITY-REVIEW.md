# Pilot hardening security review

## Threat-model delta

Since PR #71, PR #72 added production-pipeline shadow evaluation and review,
PR #74 added allow-listed controlled execution, consent binding, daily limits,
and automatic pauses, and PRs #76/#77 changed public navigation and browse
assistance. The public `/browse` flow can call `/api/ai/intake`, so that
endpoint is treated as an internet-facing AI boundary.

## Findings

| ID        | Severity | Area                                 | Status                                          | Reference |
| --------- | -------- | ------------------------------------ | ----------------------------------------------- | --------- |
| SEC-78-01 | high     | Idempotency check-then-insert        | fixed                                           | PR #78    |
| SEC-78-02 | high     | Red-team coverage and release gate   | fixed                                           | PR #78    |
| SEC-78-03 | high     | Secret and log hygiene               | fixed                                           | PR #78    |
| SEC-78-04 | high     | Autonomy RLS coverage                | fixed in migration, remote verification pending | PR #78    |
| SEC-78-05 | high     | CSP and browser security headers     | fixed                                           | PR #78    |
| SEC-78-06 | medium   | Consent and pilot action rate limits | fixed                                           | PR #78    |
| SEC-78-07 | high     | Next.js advisory                     | deferred: owner decision                        | PR #78    |

## RLS findings

Static coverage now parses every `supabase/*.sql` table declaration and checks
for both `enable row level security` and a policy. The hardening SQL adds
idempotent service-role policies and does not get applied remotely in this
change. The conditional integration test requires org-A JWT, org-B IDs, and
test keys and is skipped when those are unavailable.

## Hygiene fixes

Input and audit redaction now cover Luhn-valid card numbers, `sk-` tokens,
AWS `AKIA` keys, passwords, API keys, MFA/verification codes, and recovery
keys. Database payloads and security events use the redacted values; the
hygiene suite asserts seeded literals are absent from payloads and logs.

## CSP allowances

The browser CSP allows same-origin resources, Supabase HTTPS and realtime
origins, Sentry ingest, Cloudflare Turnstile scripts/connect/frame origins,
data/blob images, and inline style/script required by the current Next.js
rendering. Server-only Brevo and Anthropic origins are intentionally not
browser allowances.
