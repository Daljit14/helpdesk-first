# E5a — knowledge freshness

E5a gives every approved guide a freshness score (0–100) and a review-due date,
and adds a "Needs re-check" queue to `/admin/knowledge`. Organization admins can
mark a guide as reviewed, which restarts its review clock. Requester behavior
does not change in E5a.

## Flags

- `HELP_DESK_KNOWLEDGE_FRESHNESS_ENABLED=false` turns E5a on only when
  `HELP_DESK_KNOWLEDGE_HEALTH_ENABLED=true` (and the knowledge page itself needs
  `HELP_DESK_KNOWLEDGE_GOVERNANCE_ENABLED=true`).
- Do not change hosted or production flags as part of this code change.

## How the score works

- Review due = the earlier of `expires_at` and 180 days after the latest of
  `retrieved_at` or the last admin review (falls back to `created_at`).
- Score starts at 100: expired −50, review overdue −30, no dates −20, due within
  14 days −10, and each open health finding for the guide −40 critical,
  −20 warning, −5 info. Clamped to 0–100.
- States: expired, at risk (open critical finding or score below 50), overdue,
  due soon, fresh. Everything except fresh appears in the queue.
- Marking reviewed never clears an explicit expiry date or critical/other
  findings. It acknowledges only the open `outdated` warning for that guide.
  Each review is written to the admin audit log as `knowledge.guide_verified`.

## SQL

`supabase/knowledge-freshness.sql` is additive and idempotent. Apply it manually
after `knowledge-governance.sql` and `knowledge-health.sql`. It adds
`knowledge_guide_verifications` (review history, member-read-only RLS; writes go
through the service role). It has not been run against production. Rollback is
in the file's comments and drops review history.
