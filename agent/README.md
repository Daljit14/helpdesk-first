# HelpDesk First device agent

Build the Node 20 bundle with `npm run agent:build`. Enroll once:

```text
helpdesk-agent enroll --server https://helpdesk.example --token hd1_...
helpdesk-agent run
helpdesk-agent collect
helpdesk-agent claim-code
helpdesk-agent status
```

The agent collects bounded, read-only network, DNS, Wi-Fi, VPN, disk, update,
service, browser-extension, and endpoint-protection diagnostics. It sends
signed diagnostics and shadow plans over HTTPS.

Collector records contain structured, bounded data rather than command output:

```text
network_status       { adaptersUp: number, connected: boolean }
dns_resolution       { resolved: number, failed: number }
wifi_status           { connected: boolean, ssid: string | null }
vpn_status            { connected: boolean, required: false }
disk_space            { freePercent: number, freeGb: number }
service_status        { vpn|sso_helper|print_spooler|windows_update|defender:
                        "running" | "stopped" | "unknown" }
pending_updates       { available: number | null, stuck: false }
browser_extensions    { count: number }
security_tool_status  platform-specific status, or Linux not-applicable
```

Summaries are derived from these fields and capped at 512 characters. DNS
checks Microsoft, Google, and the enrolled server host. Browser extension
enumeration reads current-user Chrome and Edge manifests and caps results at
40 names.

It opens no inbound listener, runs no arbitrary shell input, changes no device
state outside the bounded B3 executors, disables no security tools, quarantines
no malware, and prints no private keys, tokens, nonces, or complete
signatures. Mutating catalog entries remain shadow-only until both the server
heartbeat and local execution opt-in allow them.
