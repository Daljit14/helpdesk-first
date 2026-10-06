# G4 — requester-agent reply and data-leak filter

G4 applies a shared secret-pattern registry to audit and requester-agent output
filtering. Requester-visible events redact credentials, other people's email
addresses, and device/network identifiers. Tool output is minimized before it
is passed back to the model, and output redactions are recorded as one
`reply_redacted` step per session turn. The Resolution Center reports the number
of distinct sessions with redacted replies.

G4 adds no environment variables or feature flags. No provider or model
configuration changes are required.

Apply `supabase/agent-reply-guard.sql` after the requester-agent, autonomy
ladder, screenshot/vision, service-health, and user-step migrations. It extends
the existing `agent_steps_kind_check` constraint with `reply_redacted`; the
file is authored but has not been applied. To roll back, run the commented
rollback block in that file, which restores the prior accepted step kinds.

## Privacy limits

- An Entra UPN that differs from the requester's login email is treated as
  another person's details and redacted.
- Notification-email `why` text is filtered without requester identity, so it
  redacts even the requester's own identifiers.
- Hostname detection is heuristic and covers internal suffixes, UNC names, and
  common Windows default hostnames; it does not identify every private hostname.
- The audit event stores redaction kinds and a match count only, never removed
  values.
