# E4 — knowledge capture

E4 adds default-off agent-session, answer-run, and staff close-out signals to the
existing knowledge-learning pipeline, plus organization-scoped draft clusters
and a clustered review queue. It does not change ticket status semantics.

## Flags

- `HELP_DESK_KNOWLEDGE_LEARNING_ENABLED=false` remains the parent switch.
- `HELP_DESK_KNOWLEDGE_CAPTURE_ENABLED=false` enables E4 only when learning is
  also enabled.
- Do not change hosted or production flags as part of this code change.

## SQL

`supabase/knowledge-capture.sql` is additive and idempotent. Apply it manually
after `knowledge-learning-candidates.sql`, following the prerequisites and
ordering in `docs/PRODUCTION-ROADMAP-STATUS.md`. It has not been run against
production. Do not add it to an automatic migration runner.

The migration adds source metadata, session-event idempotency, draft clusters,
and member-read-only cluster RLS. Rollback comments are included in the SQL;
review them before use because rollback drops captured cluster data.

## Safety and review

Agent-session capture uses stored verification records and confirmed session
hypotheses only. Session security flags, taint, failed checks, missing report
fields, and reopened backing tickets prevent capture. Existing report
completeness, redaction, sensitive-topic, credential, and exclusion controls
remain in force. One-off staff resolutions never create drafts. Clustered
candidates remain drafts until an administrator reviews them; learned steps
that fail safety validation require security review.
