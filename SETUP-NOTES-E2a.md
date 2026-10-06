# E2a — provenance and taint tracking

E2a adds provenance-aware parameter checks and instruction-content withholding
to requester-agent turns. The requester agent remains disabled by default;
taint detection, proposal gates, and reconfirmation handling are always
enabled. No environment flags are added or changed.

Apply `supabase/agent-taint.sql` after `supabase/identity-assurance.sql` and
before `supabase/audit-chain.sql`. It extends the `agent_steps_kind_check`
constraint with `tripwire_instruction_content`. The migration is authored but
has not been applied to production. The commented rollback restores the
identity-assurance step-kind list.

Tool provenance is built from raw result values. `search_guides`,
`get_org_environment`, and `get_account_status` are organization-approved;
`get_service_health` is vendor; `search_web` retains each source's vendor or
community trust. Screenshot OCR, earlier assistant replies, device
diagnostics, sign-in failures, similar-issue results, and unknown tools are
external-untrusted.

Nested parameter strings are checked against normalized provenance text.
Schema properties with `enum` or `const` are skipped, unknown keys are still
checked, and values shorter than four normalized characters are ignored.
Values also present in requester-typed text are exempt. A proposal using a
value found only in tainted content is rejected for community/external sources
and requires explicit reconfirmation for organization-approved/vendor sources.

The portal cannot approve a non-clean requester-agent consent step; approve
those actions in chat after checking every disclosed value. Missing or failed
consent-step lookup also refuses portal approval, while no matching step
preserves existing ticket-run approval behavior. Values in the disclosure are
truncated to 120 characters.

Instruction-shaped strings are withheld from model context after the existing
input safety guard. Withholding is recorded as `tripwire_instruction_content`;
the original guard behavior is unchanged.

## Browser verification before any pilot

- Confirm clean consent cards retain their existing approval behavior.
- Confirm tainted values and source labels are visible and safely rendered.
- Confirm Approve and step-up Continue stay disabled until the reconfirmation
  checkbox is checked, then submit `reconfirmTainted: true`.
- Confirm a portal approval attempt for a tainted requester-agent step is
  refused with “Approve this in the chat.”
