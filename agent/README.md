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

It never accepts `--exec`, opens an inbound listener, runs arbitrary shell
input, changes device state, disables security tools, quarantines malware, or
prints private keys, tokens, nonces, or complete signatures. Mutating catalog
entries are shadow-only in B1.
