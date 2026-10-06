# G3 — tamper-evident audit chain

G3 adds append-only, per-organization SHA-256 chains for `resolution_events`,
`agent_steps`, and `capability_autonomy_transitions`. The `agent_steps` chain
hashes its existing `result_summary` value; this change does not alter how
agent-step text is stored. The `audit_chain_intact` release gate exercises
both an intact chain and middle-row deletion.

## SQL installation and order

Apply `supabase/audit-chain.sql` after the existing migrations that create the
three audit tables and their immutable triggers:

1. `requester-agent.sql`
2. `autonomy-ladder.sql`
3. `autonomy-audit.sql`
4. `agent-reply-guard.sql`
5. `agent-user-steps.sql`
6. `requester-agent-vision.sql`
7. `audit-chain.sql`

The migration requires `pgcrypto` and the existing `organizations` table. It
backfills existing rows by organization and `(created_at, id)`, then assigns
sequential values to new inserts under an organization/table advisory lock.
Client-supplied chain fields are overwritten. The migration temporarily
disables only the matching immutable trigger while backfilling and restores it
in the same transaction. The SQL has not been applied to production.

The payload columns are intentionally fixed lists. Newly added columns are not
automatically hashed: update both `supabase/audit-chain.sql` and
`AUDIT_CHAIN_COLUMNS` in `lib/autonomy/audit/chain.ts` when the covered table
schemas change. The current `agent_steps` list includes `attachment_id`, added
by `requester-agent-vision.sql`.

## Daily verification and anchors

The cron endpoint is `/api/cron/audit-chain`, scheduled in `vercel.json` for
`30 4 * * *` (UTC). It requires `CRON_SECRET` and is disabled unless
`HELP_DESK_AUDIT_CHAIN_CHECK_ENABLED=true`; `.env.example` keeps this flag
`false`. Each run verifies the preceding 48 hours per organization and table,
checks that the latest stored anchor still points to the same row hash, alerts
with `audit_chain_broken` details `{ table, id, reason }` on a discrepancy,
and appends an anchor for the current head after each check, including when a
break was detected. Alerts use the existing
`HELP_DESK_AUTONOMY_ALERTS_ENABLED` and `HELP_DESK_NOTIFICATIONS_ENABLED`
gates; this change does not enable either flag. Anchors are service-role-only
and immutable.

For a manual server-side check:

```ts
import { verifyChain } from "@/lib/autonomy/audit/chain";
import { createAdminClient } from "@/lib/supabase/admin";

const admin = createAdminClient();
const result = await verifyChain(admin, organizationId, "resolution_events", {
  since: new Date(Date.now() - 48 * 60 * 60 * 1000),
});
```

The first row returned for a `since` range establishes the predecessor hash;
subsequent rows are checked for hash integrity, predecessor linkage, and
sequence continuity. A middle deletion is reported at the row after the gap.

Organization admins can download a date-bounded JSONL audit record from the
Resolution Center. Excluded resolution events and agent steps remain in the
export as hash/linkage-only `excluded` entries. `verifyExport(lines)` checks
included payload hashes, chain links, and the per-table summary records. Form
dates are interpreted as UTC calendar days.

## Verification

The SQL migration is exercised against PGlite with `pgcrypto` for canonical
JSON/hash parity, repeatable backfill, client-supplied chain-field replacement,
tampering, and middle deletion. A separate 50-parallel-insert test runs when
`AUDIT_CHAIN_TEST_DATABASE_URL` points to a disposable Postgres 16 database.
