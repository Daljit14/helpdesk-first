# Wave 2 G6 — requester-agent red-team coverage and contrast stability

G6 adds paired default/planner routing cases for malicious service-health,
organization-environment, user-step, and combined diagnostic inputs. The
scripted model is deliberately compromised; deterministic tool-output,
denylist, policy, and step checks must stop unsafe behavior. A suite-to-gate
registry makes every security benchmark family map to a specific release gate.
The harness verifies that each scripted route selects its expected mock model
ID, while production routing continues to use the default selector.

Outcome-feedback isolation is covered by a source scan: the feedback table is
referenced only by its action, metrics reader, and encryption modules. Recent
feedback is sanitized before metrics expose it.

The v2 public-surface color-contrast check waits for page headings and finite
entry animations before running axe. The rotating home-page Quick Tip is
paused during the check so its repeating progress animation cannot restart the
wait. Color-contrast checking remains enabled. A temporary 20-repeat run is
added to the `check` CI job to demonstrate stability.

G6 adds no flags, SQL, or environment variables. Existing feature flags remain
off by default.

## Required checks

- `check` — lint, typecheck, formatting, and tests.
- `requester-agent-e2e` — requester-agent end-to-end coverage.

Repository branch-protection settings are owned by the repository owner
(Kean); this change does not modify them.
