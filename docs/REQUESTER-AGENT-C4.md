# Requester-agent C4 vision

C4 permits up to two ready, clean screenshots per requester-agent request.
The route accepts attachment IDs only when the vision flag and organization
allowlist permit it. Intake reuses secure attachments and does not create a
new attachment table or upload pipeline.

Images are transcribed by a separate tool-less Anthropic call (or the existing
mock provider). The transcription is guarded as attachment text and wrapped
with `<untrusted_data source="screenshot">`. The agent may use the text as
evidence, never as instructions. Screenshot bytes and raw transcription are
not sent to research providers or stored in agent-step summaries.

Each accepted screenshot appends a `screenshot_received` step with its
attachment hash and emits a timeline event. Rejections append
`screenshot_rejected`; injection blocks append `security_incident` and halt the
session. Screenshot attachments are bound to an escalation ticket after the
ticket is created.
