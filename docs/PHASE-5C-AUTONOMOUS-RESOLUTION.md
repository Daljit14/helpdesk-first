# Phase 5C — Autonomous Resolution Backend (architecture, boundaries, threat model)

Status: **technical specification. No execution code in this PR.**
Baseline inspected: `main` @ `bedf156` (PRs #1–#61 merged).
Companion documents: `PHASE-5B-INVESTIGATION-PLAN.md` (investigation engine, 5B.1–5B.5 delivered), `PRODUCTION-ROADMAP-STATUS.md` (inventory and owner decisions).

> HelpDesk First is AI-first, human-by-exception — not human-free. The AI may
> automatically resolve approved, low-risk, reversible problems. It must
> escalate credentials, malware, data loss, security incidents, destructive
> operations, unsupported systems and uncertain diagnoses.

This document fixes the architecture that PRs #63–#72 implement. Anything not
written here is out of scope for those PRs and needs a revision of this document
first.

---

## 0. Definition of success

When a ticket is created, the AI investigates it, gathers evidence, selects
**only an approved capability**, passes **deterministic policy checks**,
requests consent when required, performs the action, **independently
verifies the original problem**, documents everything, and resolves the ticket
**only when the fix is proven**. All other tickets are safely escalated with a
complete Diagnosis package.

Perfection is not a goal; measurability is. The system is judged on: grounded
answers, controlled actions, proof of resolution, strict failure handling and
continuous evaluation (§13).

## 1. Autonomy levels

| Level  | AI authority                                       | Example                                       | Phase 5C status                       |
| ------ | -------------------------------------------------- | --------------------------------------------- | ------------------------------------- |
| **L0** | Information only                                   | Explain an error message                      | Live (assistant, guides)              |
| **L1** | Guides the user                                    | User follows approved, policy-filtered steps  | Live (5B.1–5B.3)                      |
| **L2** | Performs approved application/API actions          | Retry a failed notification, route a ticket   | **Target of PRs #63–#72**             |
| **L3** | Performs approved device actions with user consent | Restart print spooler, reset network adapter  | Later phase — requires endpoint agent |
| **L4** | Requires technician approval                       | System/organisation-wide configuration        | Policy decision exists; no executor   |
| **L5** | Always denied or sent to a specialist              | Password bypass, BIOS flashing, data recovery | Denied by policy today and forever    |

Rules that hold at every level:

1. The model may **recommend** an approved capability. It may **never**
   generate arbitrary commands, queries, URLs or code for execution.
2. Execution, permission and verification are decided by deterministic code
   **outside the model**.
3. A ticket is "resolved" only after independent verification (§9).
4. Every autonomous capability sits behind its own feature flag and kill
   switch (§11, §14).

## 2. High-level architecture

```text
 requester / staff                                   admin (AI Resolution Center, PR #70)
        │                                                        ▲
        ▼                                                        │
┌───────────────┐   ticket.created / user.verified   ┌───────────┴────────────┐
│ Ticket layer  │ ─────────────────────────────────▶ │ Resolution orchestrator │  PR #63
│ (existing)    │ ◀───────────────────────────────── │ deterministic FSM       │
└───────────────┘   status transitions via RPC only  └──┬────┬────┬────┬───────┘
                                                       │    │    │    │
                 ┌─────────────────────────────────────┘    │    │    └───────────────────────┐
                 ▼                                          ▼    ▼                            ▼
      ┌──────────────────┐                ┌───────────────────┐ ┌───────────────┐   ┌────────────────────┐
      │ Evidence engine  │  PR #64        │ Planner (LLM)     │ │ Risk & policy │   │ Verification       │ PR #68
      │ facts/hypotheses │ ─────────────▶ │ returns capability│▶│ engine (code) │   │ engine (code)      │
      │ confidence       │                │ *reference* only  │ │ PR #66        │   │ objective evidence │
      └──────────────────┘                └───────────────────┘ └───────┬───────┘   └─────────┬──────────┘
                                                                        ▼                     │
                                                              ┌──────────────────┐            │
                                                              │ Capability       │ PR #65/#67 │
                                                              │ registry +       │ ───────────┘
                                                              │ typed handlers   │
                                                              └────────┬─────────┘
                                                                       ▼
                                                     ┌──────────────────────────────────┐
                                                     │ Rollback · kill switches ·       │ PR #69
                                                     │ immutable audit · alerting       │
                                                     └──────────────────────────────────┘
```

Reuse, not rewrite:

| Need                     | Existing seam (keep)                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Investigation state      | `ticket_investigations`, `ticket_investigation_turns`, `lib/investigation/engine.ts`                      |
| Step risk classification | `lib/investigation/policy.ts` (`StepRisk`, `classifyStep`, `isOfferable`)                                 |
| Escalation package       | `lib/investigation/escalation.ts` (`buildEscalationPackage`, `snapshotEscalationPackage`)                 |
| Outbox/worker pattern    | `knowledge_learning_events` + `lib/knowledge/learning.ts` (`enqueue…`, `processPending…`, cron + secret)  |
| Provider boundary        | `lib/ai/types.ts`, `provider-factory.ts`, `safety-policy.ts:validateAiOutput`, timeout + mock fallback    |
| Ticket transitions       | `ticket-workflow.sql` RPCs (`handoff_ticket`, `user_verify_ticket`, `record_ai_attempt_failed`)           |
| Append-only events       | `ticket_system_events` + `ticket_system_events_immutable()` trigger                                       |
| Tenant scoping           | `organization_id` on every row, `is_org_member/staff/admin`, service-role client with explicit org filter |

## 3. Trust boundaries

```text
┌────────────────────────── UNTRUSTED ──────────────────────────┐
│ requester text · attachments (quarantine) · URL params ·      │
│ email/webhook bodies · future endpoint-agent telemetry        │
└──────────────────────────────┬────────────────────────────────┘
                               ▼  validated, size-bounded, redacted
┌────────────────────────── SEMI-TRUSTED ───────────────────────┐
│ AI provider output (Anthropic/mock/shadow) — schema-validated │
│ and treated as *advice*, never as authority                   │
└──────────────────────────────┬────────────────────────────────┘
                               ▼  deterministic policy + registry
┌────────────────────────── TRUSTED (server) ───────────────────┐
│ orchestrator · risk engine · registry · handlers · verifiers  │
│ service-role DB client with mandatory organization_id filter  │
└────────────────────────────────────────────────────────────────┘
```

| Principal                    | Trust                                   | May do                                                                                  | May never do                                                             |
| ---------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Requester                    | Untrusted input, authenticated identity | Describe problem, answer questions, give/withdraw consent, confirm/reject verification  | Choose capabilities, set parameters, see internal notes/policy internals |
| Support agent (org staff)    | Trusted for own org                     | View runs, take over, pause AI for a ticket, escalate                                   | Approve L4 actions, change org policy, see other orgs                    |
| Org admin                    | Trusted for own org                     | All of the above + approve L4, set org policy, per-org kill switch, enable capabilities | Global switches, other orgs                                              |
| Platform operator (env vars) | Fully trusted                           | Global kill switch, capability enablement, registry versions                            | —                                                                        |
| AI provider                  | Semi-trusted                            | Return one structured plan referencing a registered capability                          | Execute, set parameters outside the schema, cite unapproved sources      |
| Future endpoint agent        | Untrusted until enrolled and verified   | Report read-only telemetry signed with short-lived credentials                          | Receive free-form commands; execute anything outside a signed capability |
| Cron / worker                | Trusted (shared `CRON_SECRET`)          | Drain outboxes, recover stuck runs                                                      | Bypass policy or kill switches                                           |

Cross-boundary data is always: bounded in size, schema-validated, redacted
(§10), and tagged with `organization_id`.

## 4. Prohibited actions (permanent, all autonomy levels)

The AI planner, capability registry and executor **must not** contain or accept:

- Arbitrary shell, PowerShell, AppleScript, SQL or any free-text command.
- Registry edits, BIOS/UEFI/firmware changes, driver installation.
- Password resets, MFA changes or account unlocks without an approved identity-provider integration (none exists in 5C).
- Password/MFA/recovery-key bypass of any kind.
- Malware removal, quarantine release or security-tool disabling.
- Data recovery, disk repair, formatting, wiping or any destructive file operation.
- Remote desktop / remote control as the AI's execution mechanism.
- Organisation-wide configuration changes.
- Fetching or citing URLs not in the approved knowledge sources.
- Any action on a device or account that does not belong to the ticket's organisation.

Requests matching these are classified `specialist_only` or `deny` (§7) and
escalate with the Diagnosis package. They are also part of the benchmark (§13).

## 5. Resolution orchestrator (PR #63)

A deterministic state machine owns every AI-owned ticket. It is provider
independent and survives deploys and worker crashes.

### 5.1 States

```text
queued ─▶ investigating ─▶ planning ─▶ policy_check ─┬─▶ awaiting_consent ──┐
   ▲                                                  ├─▶ awaiting_approval ─┤
   │                                                  └─▶ executing ◀────────┘
   │                                                          │
   │                                                          ▼
   │                                                     verifying ──▶ verified ──▶ resolved
   │                                                                    │
   │                                                                    └──▶ planning (next bounded step)
   │                                                          │
   │                              ┌── rolling_back ◀──────────┤ (verification failed, rollback supported)
   │                              ▼                           ▼
   └── (retry within limits) ── escalated ◀────────────────── failed
                                  ▲
                    paused ◀──────┘ (staff "Pause AI" / kill switch; resumes to previous state or escalates)
```

Invariants (enforced in SQL check constraints + the transition function, and
covered by tests):

- `executing → resolved` is **not** a legal transition; `verified` is mandatory in between.
- `resolved` requires at least one `verification_results` row with `outcome = 'passed'` for the same run.
- `executing` requires a `policy_decisions` row with `decision IN ('allow_automatic','require_user_consent','require_technician_approval')` and, for the latter two, a matching granted `approval_requests` row.
- Any state may go to `escalated` or `paused`. `escalated` and `resolved` are terminal for the run.
- Uncertain or unresolved runs (confidence below threshold, attempts exhausted, verification failed without rollback) end in `escalated`, never in `resolved`.

### 5.2 Guarantees

| Requirement                          | Mechanism                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| One active run per ticket            | Partial unique index on `resolution_runs (ticket_id) WHERE status NOT IN ('resolved','escalated','failed')`                                        |
| Idempotent retries                   | `capability_executions.idempotency_key = sha256(run_id, step_id, capability_id, version, canonical(parameters))`, unique; handlers receive the key |
| Max attempts / cost / runtime        | `resolution_runs.max_attempts`, `budget_cents`, `deadline_at`; orchestrator checks before every transition; exceeding → `escalated` with reason    |
| Timeouts                             | Every capability has `max_runtime_ms` (§6); executor aborts via `AbortSignal`, records `timed_out`, never retries the same step more than once     |
| Circuit breakers                     | Per capability and per org: N failures in window → capability disabled for cooldown, event emitted, alert raised (§11)                             |
| Recovery after deploy/worker failure | Steps carry `lease_until`; a cron reaper re-queues expired `executing` leases as `failed` (never re-executes with the same idempotency key)        |
| Provider independence                | Orchestrator consumes `PlannerOutput` (§8); provider selection stays in `provider-factory.ts`; provider outage ⇒ `escalated` (§12)                 |
| Safe escalation                      | `escalated` always calls `snapshotEscalationPackage` and `handoff_ticket` so staff get the Diagnosis package + Needs Human                         |

### 5.3 Tables (all with `organization_id`, RLS `is_org_staff`, immutable where noted)

| Table                   | Purpose                                                                                                         | Notes                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `resolution_runs`       | One row per run: ticket, status, attempts, budget, deadline, planner/model/prompt/policy versions, initiated_by | Partial unique on active ticket                     |
| `resolution_steps`      | Ordered steps within a run: kind (`investigate/plan/policy/execute/verify/rollback`), status, lease, timings    | FK run                                              |
| `resolution_events`     | Append-only log of every transition and decision with actor and detail JSON                                     | `*_immutable()` trigger like `ticket_system_events` |
| `policy_decisions`      | Input snapshot + decision + reasons + policy version                                                            | Append-only                                         |
| `capability_executions` | Capability id/version, redacted parameters, idempotency key, handler result (sanitised), duration, cost         | Unique idempotency key; append-only                 |
| `verification_results`  | Method, objective evidence JSON, user confirmation, outcome (`passed/failed/inconclusive`), verifier version    | Append-only                                         |
| `approval_requests`     | Type (`user_consent/technician_approval`), requested/granted/denied/expired, actor, expiry                      | Consent expires; one active per step                |
| `rollback_runs`         | Linked execution, method, status, result                                                                        | Append-only                                         |
| `ai_kill_switches`      | Scope (`global/organization/capability`), scope id, enabled, reason, set_by, set_at                             | Read before every transition                        |

Run/step tables are updatable only by the orchestrator (service role with
`helpdesk.resolution_rpc` guard, same pattern as `tickets_guard_resolution_columns`).
Every other table above is insert-only.

### 5.4 Workers

Same pattern as `knowledge_learning_events`: enqueue from server actions
without blocking the user; `GET /api/cron/resolution-runs` (bearer
`CRON_SECRET`, gated by `HELP_DESK_AUTONOMY_ENABLED`) drains due steps with a
bounded limit; a second reaper route expires leases and stale approvals.

## 6. Approved capability registry (PR #65)

A versioned, code-defined registry (`lib/autonomy/capabilities/*.ts`) with a
DB mirror (`capabilities`, `capability_versions`, `organization_capabilities`)
for enablement and review dates. **Only registry entries can be executed.**

Each capability declares:

| Field                   | Type / rule                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `id`                    | `snake_case`, stable                                                                        |
| `version`               | integer; parameters schema changes bump it; old versions stay executable only if enabled    |
| `platforms`             | subset of `Windows/macOS/Linux/iOS/Android/Other/any`                                       |
| `department`            | one of the Admin departments (e.g. `Notifications and SLA`)                                 |
| `description`           | plain English, shown to staff                                                               |
| `inputSchema`           | Zod schema; **closed** (no unknown keys), bounded strings, ids validated as UUID            |
| `preconditions`         | typed checks run before policy (e.g. `outbox row exists and status in (failed,dead)`)       |
| `riskLevel`             | `safe/caution/approval/specialist/denied` (reuses `StepRisk`)                               |
| `consent`               | `none/user/technician`                                                                      |
| `orgPolicyRequirements` | org policy keys that must be true (e.g. `autonomy.notifications`)                           |
| `maxRuntimeMs`          | hard abort                                                                                  |
| `expectedResult`        | description used for the planner's `expectedEvidence` validation                            |
| `verification`          | reference to a verifier in the verification engine (§9), never "exit code"                  |
| `rollback`              | `none/compensating/<handler>`; `none` limits the capability to reversible-by-nature actions |
| `owner`, `reviewDate`   | accountable person and next review                                                          |
| `enabledOrganizations`  | allow-list (empty = disabled everywhere); pilot starts with one internal org                |
| `sideEffects`           | `read_only/internal_write/external_write`                                                   |

### 6.1 Initial capabilities (L0–L2, all reversible or read-only)

| id                                | Risk    | Side effects   | Verification                                                                  |
| --------------------------------- | ------- | -------------- | ----------------------------------------------------------------------------- |
| `search_approved_knowledge`       | safe    | read_only      | n/a (evidence gathering)                                                      |
| `ask_diagnostic_question`         | safe    | internal_write | answer recorded; same question never re-asked                                 |
| `collect_platform_context`        | safe    | internal_write | context row present                                                           |
| `check_helpdesk_service_status`   | safe    | read_only      | status endpoint response captured                                             |
| `resend_ticket_notification`      | caution | external_write | outbox row reaches `sent`; user confirms                                      |
| `retry_failed_notification`       | caution | external_write | outbox row `failed/dead → sent`                                               |
| `validate_attachment_scan_status` | safe    | read_only      | attachment `status/scan_verdict` read (new helper; no validator exists today) |
| `generate_diagnosis_package`      | safe    | internal_write | `escalation_package` snapshot present                                         |
| `request_user_verification`       | safe    | internal_write | ticket `Pending Verification`, user answers                                   |
| `route_to_department`             | caution | internal_write | assignment/department updated                                                 |
| `escalate_with_evidence`          | safe    | internal_write | `Needs Human` + package snapshot                                              |

Nothing in §4 may ever be registered. Registry changes require a PR touching
`lib/autonomy/capabilities/` (code review is the approval process) and a
version bump.

## 7. Central risk and permission engine (PR #66)

Pure function, no I/O, no LLM:

```ts
decidePolicy(input: PolicyInput): PolicyDecision
```

`PolicyInput` (snapshotted into `policy_decisions.input`):
capability risk & side effects · org policy · actor role · device ownership
(`org_managed/byod/unknown`) · platform · ticket category · confidence and
evidence quality (§8) · active consent · previous failed attempts on this
ticket · requested parameters (post-validation) · data sensitivity flags
(credentials/PII detected, student data) · kill-switch state · circuit-breaker
state.

Decision values and ordering (first match wins, deny-by-default):

1. Any kill switch on, capability disabled for org, breaker open → `deny`.
2. Capability risk `denied` or category in §4 → `deny`.
3. Risk `specialist` or sensitivity flag set → `specialist_only`.
4. Risk `approval`, `external_write` on `byod/unknown` device, or org policy requires approval → `require_technician_approval`.
5. Risk `caution`, or confidence below the automatic threshold, or ≥1 prior failed attempt → `require_user_consent`.
6. Risk `safe` and confidence ≥ threshold and evidence quality `sufficient` → `allow_automatic`.

Wording:

- **User-facing:** `Safe` / `Confirm first` (existing `riskLabel`).
- **Technician/audit view:** `Safe / Caution / Approval / Specialist / Denied`.

Provider failure never weakens policy: missing or invalid evidence maps to the
most restrictive branch it can reach (`specialist_only`/`deny`), never to
`allow_automatic`.

Implementation (PR #66): `lib/autonomy/policy/engine.ts` contains the pure
decision function, with contracts in `types.ts`, input assembly in
`build-input.ts`, persistence in `record.ts`, and public exports in
`index.ts`. Reason codes include `kill_switch_active`,
`circuit_breaker_open`, `capability_not_enabled_for_org`,
`parameters_invalid`, `capability_risk_denied`, `capability_risk_specialist`,
`capability_risk_approval`, `capability_risk_caution`,
`confidence_below_threshold`, `evidence_not_sufficient`,
`evidence_missing`, `external_write_on_byod_device`,
`external_write_on_unknown_device`, and `org_policy_missing:*`.
Technician consent active on an approval branch becomes
`allow_automatic` with `technician_consent_active`; user consent active on a
user-consent branch becomes `allow_automatic` with `user_consent_active`.
Additional hard-deny reasons beyond the list above are invalid parameters,
missing organization policy grants, unsupported platforms, and a requester
requesting a technician-consent capability.

## 8. Evidence and root-cause engine (PR #64) and planner/executor (PR #67)

### 8.1 Evidence model (extends `ticket_investigations.context/hypotheses`)

```ts
type Investigation = {
  description: string; // redacted original text
  context: { platform; os?; app?; deviceOwnership };
  attachmentFindings: { attachmentId; scanVerdict; extracted?: string }[]; // only `ready` + `clean`
  qa: { questionId; answer }[]; // questionId unique per ticket (never re-asked)
  confirmedFacts: Fact[];
  unknownFacts: string[];
  hypotheses: {
    id;
    cause;
    confidence;
    explanation;
    supporting: TestRef[];
    rejecting: TestRef[];
  }[];
  citations: ApprovedSource[]; // approved guides/sources only
  safetyWarnings: string[];
  missingInformation: string[];
};
```

Rules: confidence is not permission (§7 decides); no hypothesis is ever shown
as "confirmed cause" — UI wording stays "likely"; rejecting evidence lowers
confidence deterministically (code, not model); identical `questionId` is
rejected by the orchestrator; attachments are read only when
`status='ready' AND scan_verdict='clean'`; redaction (§10) runs before any
provider call.

### 8.2 Planner output (the only thing the model may return)

```json
{
  "diagnosis": "Likely notification delivery failure",
  "capabilityId": "retry_failed_notification",
  "capabilityVersion": 1,
  "parameters": { "ticketId": "…" },
  "expectedEvidence": ["outbox status becomes delivered"]
}
```

Validated with a **closed** Zod schema (unknown keys reject). Text fields go
through `isSafeString`-style checks from `safety-policy.ts`.

### 8.3 Executor pipeline (deterministic, in this order)

1. Validate planner schema.
2. Confirm capability id+version exists and is enabled for the org.
3. Recalculate risk independently (registry risk, never the model's).
4. Confirm tenant: every id in `parameters` resolves to a row in the run's `organization_id`.
5. Validate parameters against the capability `inputSchema`; run `preconditions`.
6. `decidePolicy` → persist `policy_decisions`.
7. Obtain consent/approval if required (`approval_requests`, expiring).
8. Execute through the typed handler with idempotency key and `AbortSignal`.
9. Capture sanitised output (allow-listed fields only).
10. Start verification (§9).

**AI-generated text is never passed to a shell, a query builder, a URL, or a
privileged API.** Handlers accept only the typed, validated parameter object.

### 8.4 Implementation (PR #67)

- Planner contracts and implementations live in `lib/autonomy/planner/`:
  `schema.ts`, `types.ts`, `deterministic-planner.ts`, `model-planner.ts`,
  `select.ts`, and `index.ts`.
- The executor lives in `lib/autonomy/executor/`, including capability
  handlers, tenant checks, preconditions, output sanitization, execution, and
  approval resumption.
- `HELP_DESK_PLANNER_ENABLED` defaults to `false`.
  `HELP_DESK_PLANNER_MODE` defaults to `shadow`; `execute` is opt-in.
  `HELP_DESK_PLANNER_PROVIDER` defaults to `deterministic`.
- Shadow mode records `plan.shadow`, records a dry policy decision, and
  escalates with `shadow_mode`; it never invokes capability handlers.
- The executor stops at `verifying`. Verification and any `resolved`
  transition are deferred to PR #68.
- Organization-specific planner policy grants and approval requirements are
  defined in `supabase/autonomy-policy.sql`. This migration is not applied by
  the application.

## 9. Independent verification engine (PR #68)

A ticket is resolved only when the original problem is tested again by a
component independent of the executor.

| Reported problem             | Acceptable verification                                          | 5C availability                             |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| Email not received           | Provider (Brevo) confirms delivery **and** user confirms receipt | Yes                                         |
| HelpDesk notification failed | `notification_outbox.status = 'sent'`                            | Yes                                         |
| Website unavailable          | Independent HTTPS check from the server to an approved host      | Yes (allow-listed hosts)                    |
| DNS problem                  | Approved lookup + HTTPS test both succeed                        | Partial (server-side only)                  |
| Printer problem              | Print service healthy **and** user confirms test page            | User confirmation only until endpoint agent |
| Application problem          | Health check passes **or** user confirms launch                  | User confirmation                           |
| Account problem              | Authorised IdP reports expected state                            | Not in 5C (no IdP integration)              |

Rules: "exit code 0" or "handler returned ok" is never evidence. Where device
access is unavailable, objective evidence is replaced by explicit user
confirmation through the existing `Pending Verification → user_verify_ticket`
flow. On failure: retry only within `max_attempts`, never repeat the same
failed capability+parameters (idempotency key blocks it), roll back when the
capability supports it, then `escalated` with the full Diagnosis package.

### 9.1 Implementation (PR #68)

- Independent verification contracts and verifiers live in
  `lib/autonomy/verification/{types,verifiers,engine,index}.ts`.
- The registry maps capability verification methods to these verifiers:

  | Method                          | Objective check                       | Requester confirmation |
  | ------------------------------- | ------------------------------------- | ---------------------- |
  | `none`                          | No objective check                    | No                     |
  | `diagnostic_answer_recorded`    | Ticket diagnostic answer exists       | No                     |
  | `investigation_context_present` | Investigation context exists          | No                     |
  | `status_response_captured`      | Succeeded status event and execution  | No                     |
  | `outbox_status_sent`            | Notification outbox status is `sent`  | Yes                    |
  | `outbox_sent_and_user_confirms` | Notification outbox status is `sent`  | Yes                    |
  | `attachment_status_read`        | Attachment scan status exists         | No                     |
  | `escalation_package_present`    | Escalation package timestamp exists   | No                     |
  | `user_verification_answer`      | Ticket reaches `Pending Verification` | Yes                    |
  | `assignment_updated`            | Department route event exists         | No                     |
  | `needs_human_with_package`      | `Needs Human` plus package exists     | No                     |

- `HELP_DESK_VERIFICATION_ENGINE_ENABLED` defaults to `false`. The executor
  keeps its pending verification seam when the flag is off; the orchestrator
  polls `verifying` runs only when the flag is enabled.
- Informational verification passes may use the new `verified → planning`
  edge for another bounded planner step. Resolving methods remain in
  `verifying` until the requester confirms through
  `user_verify_ticket`.
- Rollback execution is deferred to PR #69. In Phase 5C, a failed capability
  with a non-`none` rollback strategy records
  `rollback.unsupported_in_5c` and fails closed.
- The database guard requires a passed `verification_results` row before a run
  can become `resolved`; ticket resolution with `resolution_source = 'ai'`
  also requires requester confirmation. The verification engine never sets
  `user_confirmed` itself.

## 10. Data handling, redaction, retention and audit

- **Redaction before any provider call** (extends `learning-eligibility.ts` detectors): names, emails, student/employee identifiers, hostnames not needed, IP addresses, passwords/tokens/keys/OTP codes. Store _categories_ redacted, never the values.
- **Internal notes** are excluded from planner input by default.
- **Attachments**: never raw bytes to the provider; only scanner-clean, extracted, size-bounded text.
- **Audit**: `resolution_events`, `policy_decisions`, `capability_executions`, `verification_results`, `rollback_runs` are insert-only with immutability triggers. Every row records `initiated_by` (`ai|user:<id>|staff:<id>|cron`) and `model/prompt/capability/policy` versions.
- **Immutable provenance** (PR #69): autonomy writes stamp `initiated_by` and
  planner/model/prompt/capability/policy/verifier versions. Event details,
  execution results, policy inputs, verification evidence, and rollback output
  are redacted before persistence with bounded depth and key counts.
- **Rollback audit**: supported compensating actions are recorded in
  `rollback_runs` with `started`, `succeeded`, or `failed` events. Unsupported
  strategies are recorded explicitly rather than silently skipped.
- **Retention**: run tables follow ticket retention; redacted evidence is kept with the ticket; provider telemetry stays in `ai_provider_calls`. Deleting a ticket cascades runs but audit rows are retained (org-scoped) for the org's configured period.
- **No training**: private ticket content is never used to train an external model automatically (existing 5B.4 rule, restated).

## 11. Kill switches, circuit breakers and alerting (PR #69)

| Switch                       | Where                                                                 | Effect                                                    |
| ---------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Global AI                    | `HELP_DESK_AI_ENABLED=false` (existing)                               | Intake unavailable, no planning                           |
| Global autonomy              | `HELP_DESK_AUTONOMY_ENABLED=false` (new)                              | Orchestrator drains nothing; active runs → `paused`       |
| Per organisation             | `ai_kill_switches(scope='organization')`                              | Org runs → `paused`, then `escalated` after grace         |
| Per capability               | `ai_kill_switches(scope='capability')` / `HELP_DESK_CAP_<ID>_ENABLED` | Policy → `deny` for that capability                       |
| Circuit breaker              | automatic, `capability_breakers`                                      | Opens on N failures/window; auto half-open after cooldown |
| Staff "Pause AI"/"Take over" | Admin UI (PR #70) → `paused` / `escalated`                            | Per ticket                                                |

Switch reads happen in the policy engine on every step, so a flipped switch
takes effect before the next action. Denied or suspicious execution attempts
(schema violation, cross-tenant id, unknown capability, replayed idempotency
key) emit `resolution_events` of kind `security.*` and an alert through the
existing notification outbox to org admins.

### 11.1 Implementation (PR #69)

- `lib/autonomy/rollback/{types,handlers,engine,index}.ts` provides the
  allow-listed compensating rollback registry and execution path.
- Objective verification failure with rollback enabled follows
  `verifying → rolling_back → escalated`; rollback never resolves a run.
- `capability_breakers` persists per-organization, per-capability state and
  transitions from `open` to `half_open` after cooldown. Kill-switch reads
  remain fail-closed, and capability environment overrides are honored.
- Security events are best-effort alerts to organization admins through the
  notification outbox. Resolution Center controls remain deferred to PR #70,
  and endpoint-agent control remains deferred to the later secure endpoint
  phase.

## 12. AI/provider outage behaviour

| Failure                    | Behaviour                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Timeout / 5xx / budget     | Existing mock fallback for **intake** only; the **planner never falls back to mock**. Run → `escalated` with reason `provider_unavailable`. |
| Malformed planner output   | Schema reject → one retry with same prompt version; second failure → `escalated`.                                                           |
| Provider returns §4 action | Reject, `security.prohibited_capability` event, `escalated`.                                                                                |
| Provider down mid-run      | Steps already `verified` stand; unverified work is never marked resolved.                                                                   |

Ticket resolution by humans is never affected by autonomy failures (same
"never reverse the ticket" rule as 5B.4).

## 13. Evaluation, shadow mode and release gates (PR #71)

Versioned benchmark under `tests/autonomy-eval/` covering every supported
category plus adversarial sets: prompt injection in descriptions/attachments,
poisoned attachments, unsafe requests (§4), unsupported platforms, ambiguous
reports, tenant-isolation attacks (foreign ids in parameters), replayed
execution requests, provider timeouts and malformed outputs, repeated and
conflicting evidence, rollback and kill-switch behaviour.

Shadow mode: `HELP_DESK_AUTONOMY_MODE=shadow` runs investigate → plan →
policy and records decisions but **never executes**; decisions are compared to
reviewed expected outcomes.

Release gates (all must hold on the benchmark and in shadow production data):

- Zero unauthorised capability executions.
- Zero cross-tenant data exposure.
- Every execution references an enabled capability version.
- Every resolved ticket has `verification_results.outcome='passed'`.
- Every consent-required action has a granted, unexpired approval.
- Every failed execution terminated or rolled back safely.
- Provider failure never produced a less restrictive policy decision.
- No model output reached a shell/query/URL/privileged API.

## 14. Feature flags (all default **off**)

| Flag                                       | Scope                                    |
| ------------------------------------------ | ---------------------------------------- |
| `HELP_DESK_AUTONOMY_ENABLED`               | Orchestrator + cron (global)             |
| `HELP_DESK_AUTONOMY_MODE`                  | `shadow` (default) / `execute`           |
| `HELP_DESK_AUTONOMY_ORG_ALLOWLIST`         | Comma-separated org ids for pilot        |
| `HELP_DESK_AUTONOMY_DAILY_EXECUTION_LIMIT` | Global daily cap (pilot default 20)      |
| `HELP_DESK_CAP_<CAPABILITY_ID>_ENABLED`    | One per capability                       |
| `HELP_DESK_EVIDENCE_ENGINE_ENABLED`        | PR #64 evidence model                    |
| `HELP_DESK_POLICY_ENGINE_ENABLED`          | PR #66 (falls back to 5B.2 step policy)  |
| `HELP_DESK_VERIFICATION_ENGINE_ENABLED`    | PR #68                                   |
| `HELP_DESK_ROLLBACK_ENABLED`               | PR #69 compensating rollback             |
| `HELP_DESK_AUTONOMY_ALERTS_ENABLED`        | PR #69 security alerts                   |
| `HELP_DESK_AUTONOMY_BREAKER_COOLDOWN_MS`   | PR #69 persisted breaker cooldown        |
| `HELP_DESK_CAP_<CAPABILITY_ID>_ENABLED`    | PR #69 per-capability environment switch |
| `HELP_DESK_RESOLUTION_CENTER_ENABLED`      | PR #70 admin UI                          |

Existing switches (`HELP_DESK_AI_ENABLED`, `HELP_DESK_AI_PROVIDER`,
investigation/step-policy/escalation flags) are preserved unchanged.

## 15. Controlled pilot (PR #72)

One internal organisation, test accounts, non-sensitive tickets, 5–10 low-risk
capabilities from §6.1, small daily limit, automatic pause after repeated
failures (breaker), weekly capability review, manual review of every
autonomous resolution. Expand only when verification-pass and reopen metrics
(PR #70) demonstrate reliability.

## 16. Later phase — secure endpoint agent (not in 5C)

L3 requires software on the device. Build only after L2 is stable: signed
read-only diagnostic agent, enrolment with org ownership verification, mutual
auth with short-lived credentials, OS-specific approved handlers, signed
requests with replay protection, user-visible consent prompts, minimal OS
permissions, secure auto-update, local action logs, emergency uninstall and
org-wide revocation. Start read-only (OS/version, disk space, adapter state,
DNS/gateway reachability, service status, approved app status, sanitised
events). No general remote control, ever.

## 17. PR sequence and acceptance

| PR  | Scope                                  | Done when                                                                   |
| --- | -------------------------------------- | --------------------------------------------------------------------------- |
| #62 | This document                          | Owner approval                                                              |
| #63 | Orchestrator FSM, tables, cron, reaper | Invariants in §5.1 covered by tests; isolation test; flag off               |
| #64 | Evidence engine                        | Structured investigation persisted; no repeated questions; redaction tests  |
| #65 | Capability registry + 11 handlers      | Registry tests; §4 items rejected at registration                           |
| #66 | Policy engine                          | Table-driven decision tests incl. provider-failure branch                   |
| #67 | Planner + executor                     | Pipeline order tests; cross-tenant id rejected; idempotency replay rejected |
| #68 | Verification engine                    | Verifiers for §9 rows available in 5C; `executing→resolved` impossible      |
| #69 | Rollback, switches, audit, alerts      | Immutability triggers; switch flips honoured mid-run                        |
| #70 | AI Resolution Center                   | Admin UI with metrics + Pause/Take over/Escalate; axe + mobile              |
| #71 | Benchmark + shadow mode                | All §13 gates green                                                         |
| #72 | Pilot                                  | Weekly review cadence documented; metrics dashboard live                    |

## 18. Immediate production cleanup (done before this PR)

- `HELP_DESK_KNOWLEDGE_LEARNING_ENABLED=false` in Production until a review process for generated drafts is approved.
- User wording stays Safe / Confirm first; internal policy names retained.
- Password-reset email for the org admin sent via Supabase Auth (delivery confirmation pending from the owner).
- Still owner-dependent: Turnstile keys (before public promotion), domain-based email verification (before a school pilot).
- Existing AI, capability and organisation kill switches preserved; no autonomous endpoint execution enabled.
