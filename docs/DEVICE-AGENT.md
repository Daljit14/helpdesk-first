# Local device agent (Phase B1/B2/B3)

The device agent is an outbound-only Node 20 process. It enrolls with a
single-use token, generates an Ed25519 keypair locally, and signs every
subsequent request. The server stores only the public key and rejects stale,
replayed, unsigned, revoked, or cross-organization requests.

## Threat model

Revoking a device invalidates its key immediately. Nonces are retained for ten
minutes and timestamps have a five-minute skew window. Enrollment tokens are
hashed, short-lived, and bounded by use count. The agent never opens an
inbound port. Responses are schema validated and bounded.

Private keys are stored as mode `0600` PKCS8 PEM in the platform data
directory. Diagnostics are bounded and redacted before persistence. Device
actions are a separate catalog, not autonomy capabilities.

## Shadow mode and boundaries

B1 collects diagnostics and records proposed shadow actions only. B2 adds
queued, organization-bound jobs, consent policies, independent verification,
and snapshot rollback contracts. Device execution is disabled by default:
read-only jobs can run collectors, local-write jobs are `shadowed` when
execution is disabled and `unsupported` in execute mode. B3 adds bounded
execution while retaining the default-off boundary, and B4 adds signed
MSI/PKG/DEB packaging and service manifests. Malware quarantine remains
excluded until an explicit policy change.

The execution mode requires both `HELP_DESK_DEVICE_EXECUTION_ENABLED=true` and
an organization in `HELP_DESK_DEVICE_EXECUTION_ORG_ALLOWLIST`; global,
organization, and capability kill switches force shadow mode and cancel queued
jobs. Irreversible actions always require requester consent, read-only actions
never prompt, and reversible local-write actions require consent unless a
matching organization device-class/category preapproval exists.

## Execution (B3)

B3 has three independent switches: the server execution flag and organization
allow-list select `execute` jobs, the latest heartbeat's `executionEnabled`
value gates each run, and the local opt-in is enabled with
`helpdesk-agent enable-execution` (or disabled with
`helpdesk-agent disable-execution`). Every switch defaults to off, so the
default remains shadow mode and the agent reports `shadowed`.

Local-write actions snapshot before applying a fixed, platform-specific argv
command, verify with a diagnostic collector, and automatically restore the
snapshot after an apply or verification failure when rollback is available.
Snapshots are canonical JSON files with mode `0600` under
`${configDirectory()}/snapshots`; the directory is mode `0700`. The five
executors are DNS cache flush, network adapter reset, Wi-Fi profile reset,
allow-listed service restart, and fixed-directory temporary-file cleanup.
Temporary cleanup is irreversible, inventories only regular files older than
seven days, caps work at 5,000 files, skips symlinks and other filesystems, and
never includes Wi-Fi keys or environment variables in a snapshot. The agent
service must run with the elevation required by the platform (SYSTEM on
Windows, root or equivalent privileges on macOS/Linux) for commands that need
it.

Ed25519 request signing is used instead of mTLS because Vercel cannot terminate
client-certificate mTLS for this server-to-server transport.

## Structured collectors

The agent persists bounded structured diagnostics, never raw subprocess output:

- `network_status`: `{ adaptersUp, connected }`
- `dns_resolution`: `{ resolved, failed }`, using Microsoft, Google, and the
  enrolled server hostname
- `wifi_status`: `{ connected, ssid }`
- `vpn_status`: `{ connected, required: false }`
- `disk_space`: `{ freePercent, freeGb }`
- `service_status`: statuses only for the catalog allow-list
- `pending_updates`: `{ available, stuck }`
- `browser_extensions`: `{ count }`, from current-user Chrome/Edge manifests
- `security_tool_status`: Windows Defender or macOS Gatekeeper status; Linux
  reports not applicable

Every parser contains malformed output and command failures. Summaries are
derived from structured fields and capped at 512 characters. These diagnostics
can activate deterministic evidence hypotheses, while local-write execution
remains blocked unless all B3 switches are enabled.
