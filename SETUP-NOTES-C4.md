# Phase C4 screenshot input

C4 adds optional screenshot input to the requester agent through the existing
secure attachment pipeline. It does not add a parallel upload path or pass
image bytes into the requester-agent tool loop.

## Configuration

Keep these settings off by default:

```text
HELP_DESK_REQUESTER_AGENT_VISION_ENABLED=false
HELP_DESK_REQUESTER_AGENT_SCREENSHOT_RETENTION_DAYS=30
HELP_DESK_REQUESTER_AGENT_SCREENSHOT_MAX_BYTES=5242880
```

The organization must also be present in
`HELP_DESK_REQUESTER_AGENT_ORG_ALLOWLIST`, and
`HELP_DESK_SECURE_ATTACHMENTS_ENABLED=true` is required (screenshots use the
secure attachment pipeline). Pilot readiness is only green when
`HELP_DESK_ATTACHMENT_SCANNER=virustotal` and `VIRUSTOTAL_API_KEY` are set.
Apply `supabase/requester-agent-vision.sql` after the requester-agent and
secure-attachment migrations.

## Safety and retention

Uploads quarantine first, pass the existing inspection/scanner flow, and are
read only from private storage after ownership, organization, ready status,
scan, image MIME, size, expiry, and ticket-binding checks. C4 shortens the
attachment expiry to the earlier existing expiry or the configured screenshot
retention window. The image is sent to a separate tool-less transcription call.
Transcription is guarded and wrapped as untrusted screenshot data; it is never
treated as instructions and is not sent to research providers.

If the transcription contains prompt injection, the session halts, security
alerting runs, and a `security_incident` step is appended. Successful intake
records only the attachment hash and sanitized user summary in agent steps.

## Verification procedure

1. Apply `supabase/requester-agent-vision.sql` in the target environment.
2. Configure VirusTotal and enable the requester-agent and vision flags for a
   dedicated organization.
3. Upload a PNG, JPEG, or WebP through the requester-agent paperclip control
   and wait for `ready`.
4. Send it with a short description, confirm the screenshot timeline entry, and
   verify the model sees only the untrusted transcription.
5. Test rejected/scanning/foreign attachments and an injected transcription;
   each must avoid action execution and the injected case must halt.

The Playwright smoke coverage verifies the paperclip when the vision flag is
enabled. The secure upload server actions are not route-mockable in the
browser test harness, so an end-to-end upload requires a real configured
attachment backend and is intentionally not fabricated by the smoke test.

Disable the vision flag as the immediate rollback. Existing attachments remain
subject to the normal secure attachment retention and deletion controls.

## Repository contract notes

The existing attachment table uses `uploading`, `scanning`, `ready`,
`rejected`, `deleted`, and `legal_hold`; quarantine is represented by the
bucket/path rather than a `quarantined` status. Existing no-scanner deployments
can finalize a cleanly inspected attachment as `unscanned`; C4 accepts that
only when a scanner is not configured. Attachment binaries are in private
storage, while the organization envelope-encryption layer covers attachment
`scan_detail`, not the binary object. The requester-agent message contract is
text-only by design, so only guarded transcription enters its loop.
