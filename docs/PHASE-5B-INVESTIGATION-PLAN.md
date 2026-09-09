# Phase 5B — AI Investigation & Resolution Engine (plan)

Status: **proposal, awaiting owner approval. No code in this PR.**
Baseline inspected: `main` @ `e52a0a0` (PRs #1–#40 merged; 149 Vitest files / 736 tests, 11 Playwright specs, 30 tables).

> Don't build another ChatGPT for IT support. Build an AI that investigates the
> problem, proves why its recommendation makes sense, safely guides the user
> through troubleshooting, verifies the result, and produces a useful diagnosis
> when escalating to a human.

## 1. What exists today (Phases 1–5A, waves 1–7)

The safe-intake system referred to as "Phase 5A" is the stack built by PRs #7/#8/#18/#29/#35/#39:

| Layer                     | Modules                                                                                                                                                                                        | Verdict for the vision                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider-neutral intake   | `lib/ai/types.ts`, `intake.ts`, `provider-factory.ts`, `anthropic-provider.ts`, `mock-provider.ts`, `shadow-provider.ts`                                                                       | **Keep as the boundary.** One tool call → `match / clarify / escalate` + ≤3 question ids. No multi-turn state, no hypotheses, no evidence.                        |
| Safety                    | `safety-policy.ts` (unsafe categories, output coercion, approved-slug check), `validation.ts`, `rate-limit.ts`, `budget.ts`, kill switch `HELP_DESK_AI_ENABLED` / `HELP_DESK_AI_PROVIDER=mock` | **Keep unchanged; every new AI output passes through it.**                                                                                                        |
| Grounding                 | `lib/issues.ts` (100 curated guides, steps, risk), `lib/knowledge/governance.ts` (draft→in_review→approved→retired, citations, revisions), `lib/search.ts`                                     | Approved-only grounding exists. No guide _authoring_ (steps live in code), no external sources, no article health signals.                                        |
| Diagnostics               | `diagnosticQuestions` (8 static questions), `tickets.diagnostic_answers`, `ticket_step_outcomes` (worked / failed / could_not_perform), `ai_failed_attempts`, `ai_question_count`              | Raw material for a diagnostic tree exists but is never fed back into the next AI decision.                                                                        |
| Handoff                   | `createWorkflowTicket`, `lib/tickets/triage.ts`, `routing.ts`, `handoff_ticket()` RPC, `ai.*` system events, AI public comment                                                                 | Persists confidence/risk/handoff_reason/answers — but **no root-cause statement, evidence list or tested-steps summary**. Technician still reads the raw message. |
| Verification / resolution | `verifyTicket`, `submitResolution` (root cause, actions, tools, verification method), policy-gated exception, reopen                                                                           | Solid. Resolution reports are the untapped learning source.                                                                                                       |
| Analytics                 | `lib/admin/operations-data.ts`, `admin_resolution_metrics()` (AI vs human resolution, handoff, reopen, SLA, satisfaction)                                                                      | Missing: first-contact resolution, human-correction rate, repeated-failed-step rate, knowledge-gap counts.                                                        |
| Evals                     | `lib/ai/eval/eval.ts` (45 mocked cases, 0-unsafe gate), historical live run in `PRODUCTION-ROADMAP-STATUS.md`                                                                                  | Regression suite only for routing; nothing for diagnosis quality.                                                                                                 |
| Seams                     | notifications outbox, org/RBAC + RLS, attachments (quarantine/scan)                                                                                                                            | Reusable as-is.                                                                                                                                                   |

## 2. Gap analysis against the 10 capabilities

| #   | Capability              | Have                                       | Gap                                                                                                       |
| --- | ----------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1   | Diagnostic engine       | classify + ≤3 questions                    | no hypothesis set, no confidence per cause, no persisted tree/trace                                       |
| 2   | Research answer engine  | approved catalog citations                 | no internal-article search beyond catalog, no vetted external sources, no fact/likely/uncertain labelling |
| 3   | Safe troubleshooting    | guide-level `risk`, unsafe-category filter | no **per-step** risk class, no approval gate for medium/high steps                                        |
| 4   | Resolution verification | user verify, step outcomes                 | failed steps not excluded from next recommendation                                                        |
| 5   | Intelligent escalation  | ticket fields + events                     | no structured escalation package, technician view is raw                                                  |
| 6   | Knowledge learning      | resolution report, governance tables       | no draft-article generation from resolved tickets                                                         |
| 7   | Knowledge health        | expiry date on `knowledge_guides`          | no low-success / conflicting / gap detection                                                              |
| 8   | Context-aware           | `platform`, org id                         | no device/OS/app/role context object; no "known incidents"                                                |
| 9   | Integrations            | none                                       | no adapter interface; ticket sync is internal only                                                        |
| 10  | Analytics               | resolution/handoff/SLA/CSAT                | FCR, correction rate, repeated-failed-steps, gaps                                                         |

## 3. Design principles (constraints from the owner, kept)

1. **Additive only.** New tables/columns and new modules under `lib/investigation/`, `lib/knowledge/`, `lib/integrations/`; existing intake contract (`AiIntakeInput/Output`) stays and remains the fallback.
2. **Same safety funnel.** Every provider output → `validateAndCoerceOutput` → approved-slug check → risk gate. New output shapes get their own Zod schema + coercion in `safety-policy.ts`, never a bypass.
3. **AI never acts.** It emits _recommendations_ with a risk class; the user or a staff member performs steps and records outcomes. No device control, shell, credentials, firmware, security-control changes.
4. **Feature flags per slice** (`HELP_DESK_INVESTIGATION_ENABLED`, `HELP_DESK_KNOWLEDGE_LEARNING_ENABLED`, `HELP_DESK_INTEGRATIONS_ENABLED`), all default off; production kill switch unchanged.
5. **Every slice ships with unit tests + an eval extension + org-isolation DB test where a table is added.**

### 3.1 Guarantees (approved by the owner before implementation)

| Guarantee                                       | How it is enforced                                                                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI recommends actions but never executes them   | No code path performs device, shell, credential, firmware or security-control actions. Outputs are recommendations; humans record outcomes.                                                   |
| Only approved guide steps can be returned       | Recommended steps are `{ guideSlug, stepIndex }` references into the approved catalog; `validateAndCoerceOutput` + approved-slug check reject anything else. No free-text steps.              |
| Failed steps cannot be recommended again        | Steps with `failed` / `could_not_perform` outcomes are excluded from the prompt candidate set and rejected post-validation if the model repeats them (eval case added).                       |
| Evidence and hypotheses are stored safely       | Stored only in org-scoped RLS tables (`ticket_investigations`, `ticket_investigation_turns`) as validated structured output; attachments stay behind the existing quarantine/private storage. |
| Raw prompts and hidden reasoning are not stored | Same policy as `lib/ai/telemetry.ts` today: only provider, model, latency, token counts, outcome and validated output are persisted. No prompt text, raw completions or reasoning.            |
| Every new feature has a kill switch             | Per-slice flags (`HELP_DESK_INVESTIGATION_ENABLED`, `HELP_DESK_KNOWLEDGE_LEARNING_ENABLED`, `HELP_DESK_INTEGRATIONS_ENABLED`) default off, plus the existing global `HELP_DESK_AI_ENABLED`.   |
| Every new table enforces organization isolation | Every new table carries `organization_id`, RLS policies mirroring `ticket-workflow.sql`, and an org-isolation DB test in `tests/db/`.                                                         |

## 4. Proposed slices, in priority order

### 5B.1 Investigation trace + diagnostic engine (capabilities 1, 4, 8) — first

- **Table `ticket_investigations`** (1:1 ticket, org-scoped RLS): `context jsonb` (os, device, app, user role, platform), `hypotheses jsonb[]` (`{cause, confidence, evidence[], guideSlug?}`), `asked jsonb[]` (question id, answer), `excluded_steps text[]`, `status`.
- **Table `ticket_investigation_turns`** (append-only): every provider call's validated output, decision, question ids, confidence — the durable trace missing today (raw prompt/output still not stored, matching `telemetry.ts` policy).
- `lib/investigation/engine.ts`: `runInvestigationTurn(input: {ticketId?, message, context, priorTurns, stepOutcomes}) → InvestigationOutput` — extends the provider contract with an optional `hypotheses[]` and `nextSteps[]` (each step = `{guideSlug, stepIndex}` referencing approved catalog only, never free text). Steps whose outcome is `failed`/`could_not_perform` are excluded before the prompt and re-checked after.
- Provider: extend `CLASSIFY_TOOL` with `hypotheses` (max 3, confidence 0–1, evidence = symptom quotes ≤120 chars) — Claude and the mock provider both fill it; validation caps counts/lengths.
- UI: assistant shows "Likely causes" with confidence bars + "why" evidence; ticket page shows the trace in the timeline.
- Files: `lib/ai/types.ts` (+optional fields), `anthropic-provider.ts`, `mock-provider.ts`, `safety-policy.ts`, new `lib/investigation/*`, `supabase/investigation.sql`, `components/ai-assistant.tsx`, `app/tickets/[ticketId]/page.tsx`.

### 5B.2 Per-step risk + approval gate (capability 3)

- Add `risk: "safe" | "caution" | "approval"` per step in `lib/issues.ts` (`CATEGORY_STEPS`/`Issue.steps`), default derived from the guide's current `risk` so nothing changes until curated.
- Engine only auto-recommends `safe`; `caution` shows a confirm dialog; `approval` steps are shown to staff only (ticket action with `approval_type`, reusing `ticket_actions`).
- Files: `lib/issues.ts`, `lib/steps.ts`, `components/troubleshooting-guide.tsx`, `lib/investigation/policy.ts`, eval cases asserting no `approval` step is ever recommended to a requester.

### 5B.3 Escalation package (capability 5)

- `lib/investigation/escalation.ts`: `buildEscalationPackage(ticketId)` assembles original message, context, symptoms, Q&A, steps attempted with outcomes, hypotheses + confidence, citations, handoff reason → stored on `ticket_investigations.escalation_package jsonb` at handoff and rendered as a "Diagnosis" card at the top of `app/admin/tickets/[ticketId]/page.tsx`; included in the `ticket.needs_human` notification.
- Pure function over existing data ⇒ can ship right after 5B.1 with high confidence.

### 5B.4 Knowledge learning (capability 6)

- On `submitResolution` (+ requester confirmation): enqueue `knowledge_drafts` row (org-scoped) — AI summarises symptoms / root cause / steps from the resolution report and trace into a **draft** guide revision; visible only in `/admin/knowledge` with approve/reject; publishing goes through the existing `transitionGuide` flow. Provider output validated: steps must be phrased as instructions with a risk class, no credentials/URLs outside allow-list.
- Files: `lib/knowledge/learning.ts`, `supabase/knowledge-learning.sql`, `app/actions/knowledge.ts`, `components/admin/knowledge-table.tsx`.

### 5B.5 Knowledge health + research labelling (capabilities 2, 7)

- Nightly cron `app/api/cron/knowledge-health`: per guide — success rate from `ticket_step_outcomes`/verification, unresolved-after-guide rate, expired `expires_at`, orphan/legacy slugs, link check on citation URLs, "asked but no guide" clusters from escalations → `knowledge_health_findings` table + admin panel.
- Research engine: answers labelled `fact` (approved guide), `likely` (hypothesis with confidence), `uncertain`; external sources limited to an org-configurable allow-list (`organization_policies.trusted_sources`), fetched server-side, cited, never executed as instructions. Default allow-list empty ⇒ internal-only until an admin opts in.

### 5B.6 Analytics (capability 10)

- Extend `admin_resolution_metrics()` / `operations-data.ts`: first-contact resolution, human-correction rate (staff root cause ≠ AI top hypothesis), repeated-failed-step rate, escalation package completeness, knowledge-gap count, avg AI confidence on resolved vs escalated.

### 5B.7 Integration adapter interface (capability 9) — design only in 5B

- `lib/integrations/types.ts`: `TicketSyncAdapter { createExternal, updateStatus, postComment, importResolution }` + outbox-style `integration_events` table so HelpDesk First sits above ServiceNow/Jira SM/Freshservice/Zoho/Slack/Teams later. No concrete adapter in 5B; Slack/Teams notification channel can reuse `notification_outbox`.

## 5. Sequencing and estimate

| Slice                   | Depends on | Effort    |
| ----------------------- | ---------- | --------- |
| 5B.1 trace + engine     | —          | 1 session |
| 5B.2 step risk gate     | 5B.1       | ½ session |
| 5B.3 escalation package | 5B.1       | ½ session |
| 5B.4 knowledge learning | 5B.3       | 1 session |
| 5B.5 health + research  | 5B.4       | 1 session |
| 5B.6 analytics          | 5B.1–5B.4  | ½ session |
| 5B.7 adapter interface  | —          | ½ session |

Each slice = one PR, flag off by default, SQL additive with rollback block, live Claude eval re-run before enabling in production.

## 6. Risks and dependencies

- **Prompt/schema growth vs safety**: more fields = more surface for unsafe output. Mitigation: strict Zod caps, steps reference catalog ids only, eval gate `unsafe == 0` stays mandatory.
- **Cost**: multi-turn investigation multiplies Claude calls; daily budget (500) and per-org budget (new) needed before enabling widely.
- **Data**: with a handful of tickets, success-rate health signals are noise; thresholds must require minimum sample sizes.
- **Email**: learning/health notifications rely on Resend, which is still owner-only until a real domain is verified.
- **Stale doc**: `PRODUCTION-ROADMAP-STATUS.md` still says PR #29 is unmerged; corrected in the 5B.1 PR.
- **External research**: fetching third-party pages introduces injection risk; kept behind an allow-list and treated as citation text only.

## 7. Decision requested

Approve the order above (start with 5B.1), or reorder — e.g. 5B.3 escalation package first if the human IT team's experience matters more than assistant depth right now.
