# Per-organization data protection

## Scope and threat model

Phase C protects ticket messages, public comments, evidence snapshots,
escalation packages, and attachment scan details from a database dump and from
cross-organization or cross-column ciphertext reuse caused by an application
bug. It does not protect data already exposed to an authorized application
process. A leaked master key permits unwrapping organization keys; a leaked DEK
permits that organization's protected fields, so both are operational
secrets and must never be logged, serialized, or sent to a browser.

## Key hierarchy

The environment master key is a base64-encoded 32-byte KEK. Each organization
has one active random 32-byte DEK. The KEK wraps the DEK and the database stores
the wrapped value, KEK identifier, and key version in `organization_keys`.
Retired DEKs remain available for reads until their data has been re-encrypted.

## Field format and AAD

Text values use:

`enc:1:<keyVersion>:<iv_b64>:<tag_b64>:<ct_b64>`

JSONB values use `{ "$enc": "enc:1:..." }`. AES-256-GCM authenticates
`<organizationId>|<table>.<column>` as additional authenticated data. This
prevents moving ciphertext between organizations or protected columns.

## Rotation

Set the new master key only after preserving the old key for dual-read
operations. Rotate an organization's DEK with `rotateOrgKey`; reads continue
to resolve historical versions. Run the bounded backfill, verify zero
plaintext rows, then retire old key material according to the incident and
retention policy.

## Backfill runbook

1. Set `HELP_DESK_MASTER_KEY` and `HELP_DESK_MASTER_KEY_ID` in the server
   environment.
2. Enable `HELP_DESK_ORG_ENCRYPTION_ENABLED=true`.
3. Run `/api/cron/data-protection-backfill` with the configured cron secret.
4. Repeat until readiness reports `backfill 0 rows remaining`.
5. Investigate any database trigger rejection; do not weaken trigger semantics.

The worker processes at most 200 rows per target and is idempotent. SQL in
`supabase/data-protection.sql` is intentionally not applied by this change.

## Incident response

For a suspected master-key or DEK exposure, disable autonomous execution,
preserve audit records, restrict affected organization access, rotate the
master key and affected DEKs, backfill all protected fields, and review
database, application, and provider logs for cross-organization access.
Never print plaintext, ciphertext, or key material while investigating.

## Out of scope

The next tranche should cover `tickets.issue_title`,
`tickets.diagnostic_answers`, investigation `context` and `hypotheses`,
`resolution_events.detail`, `knowledge_drafts`, and
`tickets.satisfaction_comment`. No HMAC search tokens are included because
this tranche has no full-text search over protected fields.

## BYOK

The `KeyProvider` interface isolates wrapping and unwrapping from storage.
A future BYOK provider can implement that interface without changing field
wire formats or AAD.
