# Device-signed identifier trust

`HELP_DESK_DEVICE_SIGNED_TRUST_ENABLED` defaults to `false`. Keep it off
unless this behavior has been explicitly reviewed for a pilot.

When enabled, an exact identifier from a recent authenticated diagnostic
record for the requester's active device can avoid a second confirmation of
that value. The requester still receives the ordinary consent card; this tier
never authorizes automatic execution. Only device-local write actions qualify.
The diagnostic lookup is organization- and device-scoped and limited to the
most recent 24 hours.

The collectors do not send adapter names, and
`device_reset_network_adapter` takes no parameters, so neither has an
identifier to trust today. Only `wifi_status.data.ssid` and
`printers.data.names` are eligible. `device_restart_service.serviceName` is a
closed enum and is not tainted. Other diagnostic text, including summaries
and crashed-app names, is never an identifier.

An earlier-reply co-source is allowed because the requester may be proposing
the same exact identifier that was just returned from their signed diagnostic
record. Any additional source, such as ticket history, a screenshot, or web
content, keeps the value tainted and prevents this upgrade.

The selected active device is recorded in both the plan and execute-step
details. The device handler checks the execute-step binding against the
currently selected device before enqueueing a job; a mismatch or unreadable
binding fails closed.

This is code-only. No SQL migration or production setting was changed.
