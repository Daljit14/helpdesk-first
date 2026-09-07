# Production Roadmap Status

Roadmap version audited: **2.0** (Phase 0 / proposed PR #31).
Audit baseline: `origin/main` at `3320968` (merge of PR #32).
Test totals on that commit: Vitest **632 passed, 4 skipped** (45 files
passed, 4 DB-gated files skipped); **11 Playwright spec files**.

Status vocabulary (from the roadmap):

- **COMPLETE** — implemented on `main` and verified by tests or production use.
- **PARTIAL** — present on `main` but missing listed acceptance criteria.
- **MISSING** — not implemented on `main`.
- **BLOCKED** — requires an owner decision or a third-party service.

Evidence for every claim is a file path, SQL object, environment-variable
name, or merge commit on `main`. Anything that lives only on the open PR #29
branch is marked as such and is **not** counted as `main` state.

---

## Part A — PR inventory (#1–#30)

Merge SHA = first-parent merge commit on `main`. "Absorbed" = the PR's branch
tip is an ancestor of `main` but no dedicated PR-numbered merge commit exists.
PRs #5, #10 and #15 were `main`-headed merges of one branch into another
created through the GitHub UI; they contributed no independent code.

| PR  | Title                                                                                        | Branch                                      | State           | Merge on `main`                                              |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------- | ------------------------------------------------------------ |
| 1   | feat: repository foundation for HelpDesk First                                               | `devin/helpdesk-first-foundation`           | closed unmerged | — (superseded by #2)                                         |
| 2   | feat: repository foundation for HelpDesk First                                               | `feature/project-foundation`                | merged          | `bcb3fce2`                                                   |
| 3   | feat: Level-1 IT support homepage                                                            | `feature/level1-homepage`                   | merged          | `843b5a7b`                                                   |
| 4   | feat: knowledge-base search, filtering and dynamic issue pages                               | `feature/knowledge-base-search`             | merged          | absorbed (`f94b599a` is an ancestor of `main`)               |
| 5   | Main (UI-created branch sync)                                                                | `main`                                      | merged          | no independent code                                          |
| 6   | feat: production MVP — guided troubleshooting, escalation reports, session handling          | `feature/guided-troubleshooting-production` | merged          | `c01a2f3e`                                                   |
| 7   | feat(safe-ai-intake): conversational intake with safety-first mock AI provider               | `feature/safe-ai-intake`                    | merged          | `e5218d91`                                                   |
| 8   | fix(safe-ai-intake): validation, timeout, output validation, rate limiting                   | `feature/safe-ai-intake-fixes`              | merged          | `d4626216`                                                   |
| 9   | feat: modern redesign, 100-guide catalog, optional Supabase accounts                         | `feature/redesign-accounts-backend`         | merged          | `16beca4f`                                                   |
| 10  | Main (UI-created branch sync)                                                                | `main`                                      | merged          | no independent code                                          |
| 11  | fix(auth): redirect to app when signup returns a session                                     | `devin/1788422755-signup-session-redirect`  | merged          | `5807dcbe`                                                   |
| 12  | feat(auth): password reset flow                                                              | `devin/1788423443-forgot-password`          | merged          | `6d6e1021`                                                   |
| 13  | feat(home): iOS/Android platforms, recent dismiss, results auto-scroll, jump nav             | `devin/1788424553-home-ux`                  | merged          | `045a7a71`                                                   |
| 14  | feat: network check widget and Upstash rate limiter                                          | `devin/1788426823-network-check-upstash`    | merged          | `ffacfe06`                                                   |
| 15  | Main (UI-created branch sync)                                                                | `main`                                      | merged          | no independent code                                          |
| 16  | feat(rate-limit): accept Vercel Upstash `KV_REST_API_*` env vars                             | `devin/1788427950-upstash-kv-env`           | merged          | `95fc7fd1`                                                   |
| 17  | feat: PWA/offline, ticket attachments + live status, push notifications, status page, Sentry | `devin/1788429552-cloud-features`           | merged          | `0c544fa8`                                                   |
| 18  | fix(ai): route against the full 100-guide catalog; homepage assistant entry                  | `devin/1788434007-ai-accuracy-home-entry`   | merged          | `0d400b1b`                                                   |
| 19  | feat(operations): privacy-safe analytics, secured export API, private admin dashboard        | `devin/1788642495-operations-export-admin`  | merged          | `30bafa17`                                                   |
| 20  | feat(admin): secure live ticket and traffic dashboard                                        | `feature/admin-operations-dashboard`        | merged          | `d4243723`                                                   |
| 21  | feat(admin): edit ticket status, priority and assignee from detail page                      | `devin/1788648708-admin-ticket-editing`     | merged          | `16688086`                                                   |
| 22  | feat(resolution): multi-organization ticket and AI-resolution tracking                       | `feature/resolution-tracking`               | merged          | `a1afb79b`                                                   |
| 23  | fix(admin): live ticket table refresh, sticky form values, resilient user ticket updates     | `fix/resolution-acceptance-followups`       | merged          | `71193a52`                                                   |
| 24  | feat(footer): Staff login link to `/admin/login`                                             | `devin/1788702941-staff-login-footer`       | merged          | `bba13837`                                                   |
| 25  | feat(admin): AI handoff and ticket resolution workflow (roadmap 5K)                          | `feature/admin-ticket-resolution`           | merged          | `ef2129a3`                                                   |
| 26  | feat(ui): liquid-glass redesign (into the #25 branch)                                        | `feature/liquid-glass-ui`                   | merged          | `5645161e` (landed on `main` via #27)                        |
| 27  | feat(ui): liquid-glass redesign (to main)                                                    | `devin/1788782035-liquid-glass-to-main`     | merged          | `a6113610`                                                   |
| 28  | feat(portal): user ticket portal — track, reply, verify, reopen, rate (roadmap 5L)           | `feature/user-ticket-portal`                | merged          | `302c7d67`                                                   |
| 29  | feat(ai): Anthropic grounded provider, knowledge governance, eval gate (roadmap 5M)          | `feature/grounded-ai-provider`              | **open, held**  | not on `main` (branch tip `fb8553cb`, re-merged with `main`) |
| 30  | feat(attachments): secure quarantined image/PDF uploads, scanning, retention, audit (5N)     | `feature/secure-attachments`                | merged          | `5a1e322a`                                                   |

### A.1 Per-PR delivered scope

Only PRs that changed data, APIs, flags, roles, AI/safety, storage or
notifications are detailed. Visual/copy-only PRs (#3, #13, #18, #24, #26, #27)
and UI-sync PRs (#5, #10, #15) have no schema, API or flag footprint.

#### PR #2 — foundation

- Features: Next.js App Router + TypeScript + Tailwind v4 shell, accessible layout.
- Schema/API/flags: none. Env placeholders only.
- Tests: `lib/utils.test.ts`, `tests/e2e/landing.spec.ts`.

#### PR #4 / #6 — knowledge base, guided troubleshooting

- Features: URL-synchronised search/filter, `app/issues/[slug]`, guided step
  pages, local (browser) session persistence, escalation report text.
- Schema/API: none. Content-only safety constraints (no destructive, registry,
  BIOS/firmware or password steps).
- Tests: `lib/knowledge-base.test.ts`, `lib/search.test.ts`,
  `lib/session.test.ts`, `tests/e2e/guide.spec.ts`.

#### PR #7 / #8 — safety-first AI intake (mock provider)

- Features: `/assistant` conversational intake; provider-neutral `AiProvider`
  interface; mock provider; strict output schema validation; safety policy;
  provider timeout; rate limiting.
- API: `app/api/ai/intake/route.ts`.
- Env: `HELP_DESK_AI_ENABLED`, `NEXT_PUBLIC_AI_ENABLED`,
  `HELP_DESK_AI_PROVIDER_TIMEOUT_MS`, `HELP_DESK_AI_MAX_DIAGNOSTIC_QUESTIONS`,
  `HELP_DESK_AI_RATE_LIMIT_PROVIDER|WINDOW_MS|MAX`.
- Tests: `lib/ai/intake.test.ts`, `mock-provider.test.ts`,
  `safety-policy.test.ts`, `validation.test.ts`, `rate-limit.test.ts`,
  `tests/e2e/assistant.spec.ts`.
- Gap stated at the time: no real LLM provider.

#### PR #9 / #11 / #12 — accounts

- Features: Supabase auth (signup, login, password reset via PKCE callback),
  bookmarks, guide progress, ratings, first `tickets` table.
- Schema (`supabase/schema.sql`): `bookmarks`, `guide_progress`, `tickets`,
  `guide_ratings`, `guide_rating_totals`; RLS "Users manage their own …";
  `recalc_guide_rating_totals()`.
- Server actions: `app/actions/auth.ts`, `app/actions/guides.ts`;
  `app/auth/callback/route.ts`; `proxy.ts` session refresh.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`.
- Tests: `lib/validation.test.ts`, `tests/e2e/auth.spec.ts`,
  `tests/e2e/accessibility.spec.ts`.

#### PR #14 / #16 — network check + Upstash limiter

- API: `app/api/network-check/ping`, `app/api/network-check/payload`.
- Env: `UPSTASH_REDIS_REST_URL|TOKEN`, fallback `KV_REST_API_URL|TOKEN`.
- Tests: `lib/network-check.test.ts`, `tests/e2e/network-check.spec.ts`.

#### PR #17 — PWA, legacy attachments, push, status, Sentry

- Schema (`supabase/cloud-features.sql`): `tickets.attachment_path`; bucket
  `ticket-attachments` (legacy, superseded by #30); `push_subscriptions` + RLS.
- API: `/api/push/subscribe|unsubscribe|ticket-webhook`, `/api/status`.
- Env: `SUPABASE_WEBHOOK_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_SENTRY_DSN`,
  `SENTRY_ORG|PROJECT|AUTH_TOKEN`.
- Tests: `lib/supabase/storage.test.ts`,
  `app/api/push/ticket-webhook/route.test.ts`, `tests/e2e/cloud-features.spec.ts`.

#### PR #19 — privacy-safe analytics, export, operations

- Schema (`supabase/operations.sql`): `tickets.updated_at|priority|assigned_agent|platform|first_response_at|resolved_at`;
  `analytics_events` + RLS; `tickets_track_lifecycle()`,
  `operations_traffic_snapshot()`.
- API: `POST /api/analytics/event`, `GET /api/admin/operations/export`
  (key-protected; excludes message, user id, email, attachment path).
- Env: `OPERATIONS_EXPORT_KEY`, `OPERATIONS_PSEUDONYM_SALT`.

#### PR #20 / #21 / #23 — admin dashboard

- Schema (`supabase/admin-dashboard.sql`): `organizations`,
  `organization_members` (role ∈ `admin`, `support_agent`), `admin_profiles`
  (`mfa_enrolled`), `ticket_events`, `active_sessions`,
  `analytics_daily_totals`, `operations_audit`;
  `tickets.organization_id|category`; `is_org_member(org)`,
  `tickets_log_events()`, `analytics_retention_rollup()`,
  `admin_operations_metrics(org)`; org-scoped RLS.
- Pages: `/admin/login`, `/admin/operations`, `/admin/tickets/[ticketId]`.
- API: `/api/admin/operations` (5-minute auto-refresh + manual refresh).
- Server actions: `app/actions/admin-auth.ts`, `app/actions/admin-tickets.ts`
  (audit `ticket.update`).
- Env/flags: `HELP_DESK_ADMIN_DASHBOARD_ENABLED`,
  `HELP_DESK_ADMIN_SESSION_SECRET`, `HELP_DESK_ADMIN_REQUIRE_MFA`.
- Security: admin session requires AAL2 when the profile has
  `mfa_enrolled` or `HELP_DESK_ADMIN_REQUIRE_MFA=true` (`lib/admin/auth.ts`).
- Tests: `lib/admin/auth.test.ts`, `app/actions/admin-auth.test.ts`,
  `app/actions/admin-tickets.test.ts`, `components/admin/*.test.tsx`,
  `tests/e2e/admin-dashboard.spec.ts`, `tests/e2e/operations.spec.ts`.

#### PR #22 — multi-organisation resolution tracking

- Schema (`supabase/resolution-tracking.sql`): `tickets.resolution_source|ai_attempted|ai_attempted_at|ai_recommended_issue_id|escalated|escalated_at|escalation_reason|resolution_summary|user_confirmed|user_confirmed_at`;
  `tickets_track_resolution()`, `tickets_guard_resolution_columns()`,
  `confirm_ticket_resolved(ticket)`, `escalate_ticket(ticket, reason)`,
  `admin_resolution_metrics(org)`.
- Flag: `HELP_DESK_RESOLUTION_TRACKING_ENABLED`.
- Tests: `app/actions/resolution.test.ts`, `tests/db/resolution-isolation.test.ts`.

#### PR #25 — roadmap 5K: AI handoff + employee resolution workflow

- Schema (`supabase/ticket-workflow.sql`): `tickets.resolver_type|ai_confidence|ai_risk_level|ai_failed_attempts|ai_question_count|needs_human_at|handoff_reason|assigned_agent_id|assigned_at|first_human_response_at|human_response_due_at|overdue_notified_at|verification_requested_at|verification_method|verified_by_user|resolution_report|closed_at|diagnostic_answers`;
  status check `('Open','New','AI Reviewing','AI Resolving','Needs Human','In Progress','Waiting','Waiting for User','Pending Verification','Resolved','Closed')`;
  tables `ticket_comments` (`visibility` ∈ `public|internal`, RLS: owners
  read/add public only), `ticket_actions`, `ticket_system_events`
  (immutable trigger); RPCs `user_verify_ticket`, `handoff_ticket`,
  `record_ai_attempt_failed`, `admin_workflow_metrics(org)`.
- Server actions: `app/actions/tickets.ts`, `app/actions/admin-workflow.ts`
  (claim, assign, comment, internal note, request info, record tool/action,
  request verification, resolve → `Pending Verification`, reopen, close).
- Resolution report requires root cause, actions, tools, result,
  `verificationMethod ∈ user_confirmed|screen_shared|remote_test|other`,
  user explanation, preventive recommendation.
- Routing (`lib/tickets/routing.ts`): hand off on no approved guide, low
  confidence, unsupported platform, user asks for a person, two failures,
  privileged/security-sensitive topics, timeout/invalid schema/unsafe output.
- SLA (`lib/tickets/sla.ts`): priority-based human-response due time,
  at-risk state; push notification to employees on handoff and overdue
  (`lib/tickets/notify.ts`).
- Flag: `HELP_DESK_TICKET_WORKFLOW_ENABLED`.
- Tests: `app/actions/admin-workflow.test.ts`, `app/actions/tickets.test.ts`,
  `lib/tickets/routing|sla|notify.test.ts`,
  `tests/db/workflow-isolation.test.ts`, admin Playwright (desktop, mobile, axe).
- Production verification: full handoff → claim → resolve → verify → reopen
  path exercised on Vercel Preview (evidence in PR #25 comments).

#### PR #28 — roadmap 5L: requester portal

- Schema (`supabase/user-ticket-portal.sql`): `tickets.satisfaction_rating|satisfaction_comment|rated_at|reopen_count`;
  extended `ticket_system_events` event types; RPCs `user_reopen_ticket`,
  `user_rate_ticket`; updated `admin_workflow_metrics`.
- Pages: `/tickets`, `/tickets/[ticketId]` (status, public conversation,
  reply, confirm fixed / reject, request a person, reopen ≤14 days, rate).
- Flag: `HELP_DESK_USER_PORTAL_ENABLED` (ON in Production).
- Tests: `tests/db/portal-isolation.test.ts`, `tests/e2e/tickets-portal.spec.ts`,
  `lib/tickets/user-status.test.ts`, `components/tickets-table.test.tsx`.
- Stated gap: guest single-ticket links deferred (guest tickets not allowed).

#### PR #29 — roadmap 5M: grounded AI (OPEN, HELD — not on `main`)

- Branch contents: Anthropic provider behind `AiProvider`, provider factory,
  shadow mode, daily call budget, privacy-safe telemetry;
  `supabase/knowledge-governance.sql` (`knowledge_guides`,
  `knowledge_guide_revisions`, `approved_guide_slugs(org)`); admin knowledge
  governance page (Draft/In Review/Approved/Retired, owner, reviewer, expiry,
  platforms, risk tier, revisions/rollback); citations on the admin and
  requester ticket pages; fixed adversarial eval suite.
- Env (branch only): `HELP_DESK_AI_PROVIDER`, `HELP_DESK_AI_MODEL`,
  `ANTHROPIC_API_KEY`, `HELP_DESK_AI_DAILY_CALL_BUDGET`,
  `HELP_DESK_KNOWLEDGE_GOVERNANCE_ENABLED`.
- Hold reason: live eval could not run — Anthropic account has no API
  credits. Branch is current with `main` (`fb8553cb`), CI green.

#### PR #30 — roadmap 5N: secure attachments

- Schema (`supabase/secure-attachments.sql`): private buckets
  `ticket-attachments-quarantine`, `ticket-attachments-private`; tables
  `attachment_policies`, `ticket_attachments`, `attachment_events`
  (immutable); `purge_expired_attachments()`; org-scoped RLS.
- Pipeline: browser → quarantine → `finalizeAttachmentUpload()` →
  signature sniffing + image re-encode/metadata strip + PDF structural
  checks (rejects encryption, JavaScript, launch actions, embedded files,
  RichMedia, XFA, oversized page counts) → optional scanner → private bucket
  → short-lived signed URL. Defaults: 10 files/ticket, 20 MB/file, 100 MB
  total, PNG/JPEG/WebP/PDF, 365-day retention, legal hold.
- API/cron: `GET /api/cron/attachments-purge` (bearer `CRON_SECRET`),
  `vercel.json` daily 03:00 UTC.
- Server actions: `app/actions/attachments.ts`,
  `app/actions/admin-attachments.ts` (rescan, mark safe, reject, delete,
  legal hold, policy). Pages: `/admin/attachments`.
- Env/flags: `HELP_DESK_SECURE_ATTACHMENTS_ENABLED` (ON in Production),
  `HELP_DESK_ATTACHMENT_SCANNER` (`none` | `virustotal`), `VIRUSTOTAL_API_KEY`,
  `HELP_DESK_ATTACHMENT_RETENTION_DAYS`, `CRON_SECRET` (set in Production).
- Tests: `lib/attachments/inspect|policy|scanner.test.ts`,
  `app/actions/attachments.test.ts`, `app/actions/admin-attachments.test.ts`,
  `tests/db/attachments-isolation.test.ts`, `tests/e2e/attachments.spec.ts`.
- Stated gaps: no OCR/PDF text extraction; attachments not passed to AI;
  scanner defaults to `none` pending owner choice.

### A.2 Production configuration (Vercel, as of this audit)

Flags ON in Production: `HELP_DESK_ADMIN_DASHBOARD_ENABLED`,
`HELP_DESK_RESOLUTION_TRACKING_ENABLED`, `HELP_DESK_USER_PORTAL_ENABLED`,
`HELP_DESK_SECURE_ATTACHMENTS_ENABLED`. `HELP_DESK_TICKET_WORKFLOW_ENABLED`
is ON in Preview only. `HELP_DESK_AI_ENABLED` / `NEXT_PUBLIC_AI_ENABLED` exist
in Production; the grounded provider (PR #29) is not deployed anywhere.

---

## Part B — Requirements status matrix (Roadmap 2.0 §5–§10)

### 5.1 Requester experience

| Requirement                                             | Status                              | Evidence / gap                                                                                                               |
| ------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sign in via verified identity                           | PARTIAL                             | Supabase email/password + reset (#9/#12). No org SSO, no verified-domain identity.                                           |
| Describe problem once (text)                            | COMPLETE                            | `/assistant` intake → ticket (#7, #25).                                                                                      |
| Select/confirm device, OS, app, urgency                 | PARTIAL                             | Platform + priority captured (`tickets.platform                                                                              | priority`); no application/version field. |
| Attach screenshots/PDFs                                 | COMPLETE                            | #30 (flag ON).                                                                                                               |
| Ticket number immediately                               | COMPLETE                            | `TCK-…` shown on creation (#25/#28).                                                                                         |
| Continue AI conversation inside the ticket              | PARTIAL                             | Diagnostic questions answered at intake; no continued AI turn after ticket creation.                                         |
| Cited, approved troubleshooting steps                   | MISSING                             | Citations/governance only on PR #29 branch.                                                                                  |
| Report each step worked / failed / could not perform    | COMPLETE (PR #32, merged `3320968`) | `components/ticket-step-outcomes.tsx`; `record_step_outcome(...)`; `ticket_step_outcomes`.                                   |
| Request a human at any time                             | COMPLETE                            | Portal "request a person" → `handoff_ticket` (#28).                                                                          |
| Full history retained on handoff                        | COMPLETE                            | Original description, AI attempts, questions, handoff reason preserved (#25).                                                |
| Read/respond to employee public comments                | COMPLETE                            | `ticket_comments` public visibility (#25/#28).                                                                               |
| Status, assignment, expected next response, last update | COMPLETE (PR #32, merged `3320968`) | `app/tickets/[ticketId]/page.tsx`; `lib/tickets/user-status.ts`; `assigned_agent_id`, `human_response_due_at`, `updated_at`. |
| Confirm fixed / reject / reopen                         | COMPLETE                            | `user_verify_ticket`, `user_reopen_ticket` (#28).                                                                            |
| Rate outcome + feedback                                 | COMPLETE                            | `user_rate_ticket` (#28).                                                                                                    |
| Export or request deletion of own data                  | MISSING                             | No self-service export/deletion.                                                                                             |
| Never see internal notes / other tenants / prompts      | COMPLETE                            | RLS on `ticket_comments`, `ticket_system_events`; `tests/db/portal-isolation.test.ts`.                                       |

### 5.2 Employee/Admin experience

| Requirement                                                                                                           | Status                              | Evidence / gap                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Queue cards (incl. Reopened)                                                                                          | COMPLETE (PR #32, merged `3320968`) | `components/admin/admin-dashboard.tsx`; `Reopened` status and queue card/filter.                                                 |
| Filters (org, status, priority, platform, category, assignee, AI confidence, risk, handoff reason, resolution source) | COMPLETE (PR #32, merged `3320968`) | `lib/admin/operations-data.ts`; `app/api/admin/operations/route.ts`; dashboard controls map confidence, risk and handoff reason. |
| Sortable table, 5-minute + manual refresh                                                                             | COMPLETE                            | `/api/admin/operations`, `components/admin/*` (#20/#23).                                                                         |
| Claim / reassign                                                                                                      | COMPLETE                            | `app/actions/admin-workflow.ts`.                                                                                                 |
| Public comments + internal notes                                                                                      | COMPLETE                            | `visibility` column + RLS.                                                                                                       |
| Full AI summary, evidence, citations, attempts, handoff reason                                                        | PARTIAL                             | Summary, confidence, risk, attempts, reason shown; citations require PR #29.                                                     |
| Attachment scan status + authorised viewing                                                                           | COMPLETE                            | `/admin/attachments`, `AdminAttachmentControls` (#30).                                                                           |
| Immutable activity timeline                                                                                           | COMPLETE                            | `ticket_system_events` + immutability trigger.                                                                                   |
| Structured tool/action log                                                                                            | COMPLETE                            | `ticket_actions`.                                                                                                                |
| Priority / status / SLA controls                                                                                      | COMPLETE                            | #21, #25.                                                                                                                        |
| Request information / request verification                                                                            | COMPLETE                            | #25.                                                                                                                             |
| Required resolution report                                                                                            | COMPLETE                            | Zod schema in `admin-workflow.ts` (7 required fields).                                                                           |
| Reopen and close                                                                                                      | COMPLETE                            | #25/#28.                                                                                                                         |
| Org-scoped analytics + export                                                                                         | COMPLETE                            | `admin_workflow_metrics(org)`, `/api/admin/operations/export`.                                                                   |
| Audited settings for users, roles, policies, knowledge, integrations                                                  | PARTIAL                             | Attachment policy settings only; no user/role/knowledge/integration admin UI on `main`.                                          |
| Individual `support_agent` accounts                                                                                   | COMPLETE                            | `organization_members.role`, per-user Supabase auth.                                                                             |

### 5.3 Ticket lifecycle

| Requirement                                              | Status                              | Evidence / gap                                                                                                                                               |
| -------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Required statuses incl. `Reopened`                       | COMPLETE (PR #32, merged `3320968`) | `supabase/wave-1-2-remediation.sql` recreates `tickets_workflow_status_check`; `lib/operations/transform.ts` and requester/admin actions support `Reopened`. |
| Server-side validated, org-scoped, audited transitions   | COMPLETE                            | Server actions + DB triggers + `ticket_system_events`; `tests/db/workflow-isolation.test.ts`.                                                                |
| Normal resolution requires user confirmation             | COMPLETE                            | Resolve → `Pending Verification`; `user_verify_ticket`.                                                                                                      |
| Documented employee verification exception, policy-gated | COMPLETE (PR #32, merged `3320968`) | `organization_policies.allow_verification_exception`; `submitResolution`; `tickets_employee_resolution_confirmation`; `verification.exception`.              |
| AI cannot verify itself                                  | COMPLETE                            | No AI path writes `verified_by_user`/`Resolved`.                                                                                                             |

### 5.4 AI triage and handoff

| Requirement                                                                                                                          | Status   | Evidence / gap                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------- |
| Strict structured result (category, guide id, platform, summary, questions, confidence, risk, decision, explanation, handoff reason) | PARTIAL  | `AiIntakeOutput` schema covers all but approved source/version ids (PR #29 adds them). |
| Handoff rule set                                                                                                                     | COMPLETE | `lib/tickets/routing.ts` + `lib/ai/safety-policy.ts`; `routing.test.ts`.               |
| Provider timeout / invalid schema / outage → handoff                                                                                 | COMPLETE | #8 (`validation.ts`, timeout).                                                         |
| Budget limit → handoff                                                                                                               | MISSING  | Daily budget only on PR #29 branch.                                                    |
| Retrieved content injection → handoff                                                                                                | PARTIAL  | Safety policy screens user text; no retrieval layer exists on `main` to screen.        |

### 5.5 Grounded knowledge system

| Requirement                                                                                             | Status                                             | Evidence / gap                                                         |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| Priority of sources; approved-only                                                                      | MISSING                                            | On `main`, guidance is the static 100-guide catalog (`lib/issues.ts`). |
| Draft / In Review / Approved / Retired, owner, reviewer, version, risk tier, platforms, expiry, history | MISSING (on `main`) — implemented on PR #29 branch |
| YouTube allowlisted sources with metadata                                                               | MISSING                                            | Not on `main` or #29.                                                  |
| Steps mapped to approved versions + citations                                                           | MISSING (on `main`) — implemented on PR #29 branch |

### 5.6 AI provider gateway

| Requirement                                   | Status                                         | Evidence / gap                                                                  |
| --------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Provider-neutral interface                    | COMPLETE                                       | `AiProvider` (`lib/ai/types.ts`).                                               |
| Primary + optional secondary provider         | MISSING                                        | Single provider; #29 adds factory but no failover.                              |
| Per-org provider policy                       | MISSING                                        |                                                                                 |
| Server-only secrets                           | COMPLETE                                       | No `NEXT_PUBLIC_` provider secrets.                                             |
| Schema validation after every call            | COMPLETE                                       | `lib/ai/validation.ts`.                                                         |
| Provider-independent safety validation        | COMPLETE                                       | `lib/ai/safety-policy.ts`.                                                      |
| Timeout, cancellation, retry, circuit breaker | PARTIAL                                        | Timeout + AbortSignal; no retry/circuit breaker.                                |
| Token/cost budgets                            | MISSING (on `main`) — daily call budget on #29 |
| Kill switch global / env / org                | PARTIAL                                        | Global (`HELP_DESK_AI_ENABLED`, `NEXT_PUBLIC_AI_ENABLED`); no per-org switch.   |
| Privacy-safe usage metrics                    | PARTIAL                                        | Analytics events pseudonymised; per-call AI latency/cost telemetry only on #29. |
| Safe handoff when all providers down          | COMPLETE                                       | Provider failure → `Needs Human`.                                               |
| Real grounded provider                        | BLOCKED                                        | PR #29 held on Anthropic API credits + live eval.                               |

### 5.7 Images and PDF attachments

| Requirement                                  | Status   | Evidence / gap                                                                                            |
| -------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| Bounded, configurable quotas                 | COMPLETE | `attachment_policies`, defaults 10/20 MB/100 MB.                                                          |
| Private storage, signed short-lived access   | COMPLETE | Private buckets, signed URLs; no public URLs in UI.                                                       |
| File-signature validation                    | COMPLETE | `lib/attachments/inspect.ts`.                                                                             |
| Malware scanning                             | BLOCKED  | `AttachmentScanner` abstraction + VirusTotal adapter exist; default `none` — owner must choose a scanner. |
| Quarantine                                   | COMPLETE | Quarantine bucket + `scanning`/`ready`/`rejected` states.                                                 |
| Image metadata removal                       | COMPLETE | Re-encode strips metadata.                                                                                |
| OCR / PDF extraction with limits             | MISSING  | Explicitly excluded in #30.                                                                               |
| Secret / sensitive-data check before AI use  | MISSING  | Attachments are not passed to AI.                                                                         |
| Password-protected file handling             | COMPLETE | Encrypted PDFs rejected.                                                                                  |
| Rate limits, retention, deletion, legal hold | COMPLETE | Per-org limits, 365-day purge cron, `legal_hold`.                                                         |
| Access logging / audit events                | COMPLETE | `attachment_events` (immutable).                                                                          |

### 5.8 Multi-organisation identity and student privacy

| Requirement                                                                  | Status   | Evidence / gap                                                                                                 |
| ---------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Roles `requester`, `support_agent`, `org_admin`, restricted `platform_admin` | PARTIAL  | Roles on `main`: `admin`, `support_agent` (+ implicit requester = authenticated user). No `platform_admin`.    |
| `org_id` on every tenant row + RLS                                           | COMPLETE | `organization_id` on tickets; org-scoped RLS on comments, actions, events, attachments; 4 DB isolation suites. |
| Tenant enforcement in caches, search, retrieval, exports, jobs               | PARTIAL  | Exports/metrics org-scoped; no retrieval layer yet; purge job is cross-org by design (service role).           |
| Organisation creation, verified domain, invitations, role management, SSO    | MISSING  | Organisations/members are seeded by SQL; no onboarding UI.                                                     |
| Minimal school directory fields                                              | COMPLETE | Only auth id, email, display name, membership role stored; no grades/health/etc.                               |
| Jurisdiction / age / DPA / privacy review                                    | BLOCKED  | Owner decisions (Roadmap §14).                                                                                 |

### 5.9 Comments, actions and resolution records

| Requirement                                                                                                                   | Status                              | Evidence / gap                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Messages: author, timestamp, org, ticket, visibility                                                                          | COMPLETE                            | `ticket_comments`.                                                                                                                        |
| Edit/delete policy                                                                                                            | MISSING                             | Comments are append-only; no edit/delete policy defined.                                                                                  |
| Internal notes excluded before serialisation to requesters                                                                    | COMPLETE                            | RLS + `listPublicComments`; `portal-isolation.test.ts`.                                                                                   |
| Action record: tool, version, actor, reason, redacted params, consent type, times, result, verification, rollback, audit link | COMPLETE (PR #32, merged `3320968`) | `supabase/wave-1-2-remediation.sql` adds richer `ticket_actions` fields; `app/actions/admin-workflow.ts` validates and scrubs parameters. |
| Resolution record incl. resolver type                                                                                         | COMPLETE                            | `resolution_report` JSON + `resolver_type`.                                                                                               |

### 5.10 Notifications and SLA

| Requirement                                                                                                      | Status   | Evidence / gap                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notify on creation, handoff, assignment, reply, info request, verification request, resolution, reopen, SLA risk | PARTIAL  | Web push only: handoff + overdue to employees (`lib/tickets/notify.ts`), ticket status changes to requester (`/api/push/ticket-webhook`). No email; not all events. |
| Outbox/queue, idempotency, retries, DLQ, replay                                                                  | MISSING  | Direct send; no `notification_outbox`.                                                                                                                              |
| First-response vs resolution targets tracked                                                                     | PARTIAL  | Human-response due/at-risk tracked (`lib/tickets/sla.ts`); no resolution target.                                                                                    |
| Dashboard Last Updated + stale warning                                                                           | COMPLETE | Admin dashboard auto-refresh component.                                                                                                                             |
| Email provider                                                                                                   | BLOCKED  | Owner decision (§14).                                                                                                                                               |

### 5.11 Trust and analytics centre

| Requirement                                                                                                                                                       | Status   | Evidence / gap                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Counts (created/open/waiting/resolved/closed/reopened), AI vs employee resolutions, handoff rate, verified rate, SLA at-risk, workload, satisfaction, reopen rate | PARTIAL  | `admin_workflow_metrics`/`admin_resolution_metrics` cover most; no handoff-reason breakdown, response-time percentiles, verification-failure/rollback counts, knowledge-version usage, provider error rates or scan-failure metrics. |
| Computed from authoritative ticket/event data                                                                                                                     | COMPLETE | SQL functions over `tickets`/events.                                                                                                                                                                                                 |
| Drill-down without hidden reasoning / other tenants                                                                                                               | COMPLETE | Org-scoped detail pages.                                                                                                                                                                                                             |

### 5.12 Developer platform

| Requirement                                            | Status  | Evidence / gap                                        |
| ------------------------------------------------------ | ------- | ----------------------------------------------------- |
| `/api/v1/*` REST, webhooks, API keys, OpenAPI, sandbox | MISSING | No `api/v1` routes, `api_keys` or `webhook_*` tables. |

### 5.13 Cross-platform and support coverage

| Requirement                                                       | Status  | Evidence / gap                                                                                                                                                                     |
| ----------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsive, keyboard, screen reader, WCAG 2.2 AA                  | PARTIAL | Playwright desktop + mobile + axe on key pages; no manual screen-reader pass or full-site audit.                                                                                   |
| Browser matrix (Chrome/Edge/Firefox/Safari, iOS, Android)         | PARTIAL | Playwright Chromium + mobile emulation only.                                                                                                                                       |
| Guidance matrix labelled by platform tier                         | PARTIAL | Windows/macOS/Linux/iOS/Android guides exist; no "limited support" labelling or specialist-route gating.                                                                           |
| Content packs (QuickBooks, legal apps, onboarding/offboarding, …) | PARTIAL | 100-guide catalog covers network, printers, email, audio/video, storage, performance, accounts, coding errors; QuickBooks, legal-industry and onboarding/offboarding packs absent. |
| Restricted content risk tiers + human gates                       | PARTIAL | Safety policy blocks SFC/DISM-class topics at intake; no risk-tier metadata on guides (#29 adds `risk_tier`).                                                                      |

### §6 Core data model

| Entity                                                              | Status                                                                       | Present as                                                                                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| organizations                                                       | COMPLETE                                                                     | `organizations`                                                                                                               |
| users                                                               | COMPLETE                                                                     | Supabase `auth.users` + `admin_profiles`                                                                                      |
| organization_memberships                                            | COMPLETE                                                                     | `organization_members`                                                                                                        |
| organization_policies                                               | COMPLETE (PR #32, merged `3320968`)                                          | `public.organization_policies` in `supabase/wave-1-2-remediation.sql` (`allow_verification_exception`, `reopen_window_days`). |
| tickets                                                             | COMPLETE                                                                     | `tickets`                                                                                                                     |
| ticket_messages                                                     | COMPLETE                                                                     | `ticket_comments`                                                                                                             |
| ticket_assignments                                                  | PARTIAL                                                                      | Columns on `tickets` + events; no history table                                                                               |
| ticket_events                                                       | COMPLETE                                                                     | `ticket_system_events` (+ legacy `ticket_events`)                                                                             |
| ticket_attachments                                                  | COMPLETE                                                                     | `ticket_attachments`                                                                                                          |
| ai_runs / diagnoses                                                 | PARTIAL                                                                      | Columns on `tickets` (`ai_*`, `diagnostic_answers`); no run table                                                             |
| knowledge_sources/documents/versions                                | MISSING (on `main`) — `knowledge_guides`, `knowledge_guide_revisions` on #29 |
| action_records                                                      | COMPLETE                                                                     | `ticket_actions`                                                                                                              |
| verification_records                                                | PARTIAL                                                                      | Columns on `tickets`                                                                                                          |
| notification_outbox / deliveries                                    | MISSING                                                                      |                                                                                                                               |
| audit_events                                                        | PARTIAL                                                                      | `operations_audit`, `ticket_system_events`, `attachment_events` (separate append-only tables, no unified table)               |
| api_keys / webhook_endpoints / webhook_deliveries                   | MISSING                                                                      |                                                                                                                               |
| endpoint_devices / capability_definitions / action_runs / approvals | MISSING (future, Finish line B)                                              |

### §8 Security and privacy baseline

| Control                                          | Status   | Evidence / gap                                                                                                |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------- |
| Threat model, DFD, PIA, data inventory           | MISSING  |                                                                                                               |
| MFA for employees/admins                         | PARTIAL  | AAL2 enforced when enrolled or `HELP_DESK_ADMIN_REQUIRE_MFA=true`; not mandatory by default, no enrolment UI. |
| Session rotation, revocation, inactivity expiry  | PARTIAL  | Supabase sessions + signed admin session; no inactivity timeout or revocation UI.                             |
| Least privilege / deny by default                | COMPLETE | RLS everywhere; service role server-only.                                                                     |
| Tenant negative tests                            | COMPLETE | 4 `tests/db/*-isolation.test.ts` suites.                                                                      |
| CSRF, CSP, HSTS, security headers                | MISSING  | No global header config in `next.config.ts`/`proxy.ts`. Server actions give CSRF origin checks by default.    |
| Input/schema validation at boundaries            | COMPLETE | Zod on all server actions and API routes.                                                                     |
| Rate limits on login/ticket/comment/AI/upload    | PARTIAL  | AI intake (Upstash), admin login, upload quotas; no generic login/ticket/comment limiter.                     |
| Secrets management / rotation procedure          | PARTIAL  | Vercel env vars, none in source; no documented rotation runbook.                                              |
| Dependency / secret / SAST / DAST scanning in CI | PARTIAL  | CI runs lint/typecheck/tests/build; no security scanners.                                                     |
| Protected audit access, privacy-safe logs        | COMPLETE | Append-only audit tables; export excludes PII.                                                                |
| Encryption in transit / at rest                  | COMPLETE | Vercel TLS, Supabase managed encryption.                                                                      |
| Vendor privacy/retention review                  | BLOCKED  | Depends on provider decision.                                                                                 |
| Legal pages (privacy, terms, AUP, subprocessors) | MISSING  |                                                                                                               |
| Penetration test, disclosure process             | BLOCKED  | Owner to name reviewer/pen-test owner (§14).                                                                  |

### §9 Reliability and operations

| Control                                                                         | Status   | Evidence / gap                                                               |
| ------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------- |
| Error tracking                                                                  | COMPLETE | Sentry (#17).                                                                |
| Health check                                                                    | COMPLETE | `/api/status`, `/status`.                                                    |
| Metrics/alerts (auth failures, latency, backlog, SLA, notifications, scans, AI) | PARTIAL  | Dashboard metrics exist; no alerting.                                        |
| Runbooks                                                                        | MISSING  |                                                                              |
| Backups / restore drill / RPO / RTO                                             | BLOCKED  | Supabase managed backups; drill and objectives need owner approval + budget. |
| Load tests                                                                      | MISSING  |                                                                              |

### §10 AI safety evaluation

| Requirement                           | Status                                      | Evidence / gap                                                                                                                                    |
| ------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versioned adversarial test set        | PARTIAL                                     | `lib/ai/safety-policy.test.ts`, `mock-provider.accuracy.test.ts` on `main`; full fixed suite (injection, cross-tenant, outage, budget) on PR #29. |
| Release gate run against a live model | BLOCKED                                     | Needs Anthropic credits (PR #29 hold).                                                                                                            |
| Shadow mode                           | MISSING (on `main`) — implemented on PR #29 |

---

## Part C — Roadmap 2.0 wave mapping

Wave 1/2 remediation is PR #32, merged as `3320968`; the completed
deliverables below are now on `main`. The
`supabase/wave-1-2-remediation.sql` migration is applied to the Supabase
project.

| Wave | Roadmap deliverable                             | Audit result                                                                                                                                                                                        |
| ---- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | This audit                                      | This document.                                                                                                                                                                                      |
| 1    | Unified ticket lifecycle + AI/human workflow    | COMPLETE (PR #32, merged `3320968`) — `Reopened` status, per-step outcomes, policy-gated verification exception, confidence/risk/handoff filters, richer `ticket_actions`.                          |
| 2    | Requester portal + conversation                 | COMPLETE (PR #32, merged `3320968`) for the remediation scope — assignment/SLA visibility and last-updated requester copy; continued AI turn and self-service export/deletion remain separate gaps. |
| 3    | Organisation onboarding, RBAC, tenant hardening | MISSING/BLOCKED — needs identity/SSO/region decisions. First substantive new wave.                                                                                                                  |
| 4    | AI gateway + real grounded provider             | BLOCKED on Anthropic credits; PR #29 ready. Remediation after unblock: secondary provider/failover, per-org kill switch, retry/circuit breaker.                                                     |
| 5    | Knowledge governance + citations                | Implemented on PR #29 (ships with wave 4). YouTube sources MISSING.                                                                                                                                 |
| 6    | Secure images/PDFs                              | Largely COMPLETE via #30. BLOCKED: scanner choice. MISSING: OCR/extraction + sensitive-data check.                                                                                                  |
| 7    | Notifications, SLA, live operations             | PARTIAL — push only; outbox/email MISSING; BLOCKED on email provider.                                                                                                                               |
| 8    | Trust centre + analytics                        | PARTIAL.                                                                                                                                                                                            |
| 9    | Versioned API, webhooks, sandbox                | MISSING.                                                                                                                                                                                            |
| 10   | Security/privacy hardening + legal              | PARTIAL (RLS, MFA option, validation) / MISSING (headers, scanners, legal pages) / BLOCKED (reviewer).                                                                                              |
| 11   | Reliability, backups, monitoring, cost          | PARTIAL / MISSING / BLOCKED (RPO/RTO approval).                                                                                                                                                     |
| 12   | UI/accessibility/browser/content coverage       | PARTIAL.                                                                                                                                                                                            |
| 13   | Staging + closed pilot                          | MISSING.                                                                                                                                                                                            |
| 14   | GA                                              | MISSING.                                                                                                                                                                                            |

Recommended next PR after owner review: **Wave 3** once identity/region
decisions are recorded, while PR #29 (waves 4–5) waits for Anthropic credits.

---

## Part D — Owner decisions still open (Roadmap §14)

| Decision                                                | Blocks                 | Status                                                                                                                |
| ------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Launch region, school scope, minimum user age           | Wave 3, privacy review | RECORDED — launch region United States; under-13 students in scope with COPPA/FERPA review gate before school rollout |
| Primary/secondary AI provider, retention terms          | Wave 4                 | Primary = Anthropic (chosen); credits and secondary open                                                              |
| Identity provider / school SSO                          | Wave 3                 | RECORDED — identity = Google Workspace + Microsoft Entra SSO for org members                                          |
| Malware scanner and quotas                              | Wave 6                 | Quotas = roadmap defaults; scanner open (`none` today)                                                                |
| Email provider / sending domain                         | Wave 7                 | Open                                                                                                                  |
| Default retention/deletion policy                       | Pilot                  | Attachments 365 days; tickets open                                                                                    |
| Business hours, priorities, response/resolution targets | Wave 7                 | Response targets exist per priority; resolution targets open                                                          |
| Privacy/security reviewer, pen-test owner               | Wave 10                | Open                                                                                                                  |
| Support/on-call owner, incident contact                 | Pilot/GA               | Open                                                                                                                  |
| Hosting budget, reliability objectives                  | Wave 11                | Open                                                                                                                  |

---

## Part E — Known gaps, TODOs and rollback notes carried forward

- Legacy bucket `ticket-attachments` and `tickets.attachment_path` (#17)
  remain for tickets created before #30; UI hides the legacy URL when
  secure attachments are enabled. Removal needs a data migration.
- Legacy statuses `Open` and `Waiting` are still valid in the DB check
  constraint; new tickets use the 5K vocabulary.
- Roles are `admin`/`support_agent`; roadmap names are `org_admin`/
  `support_agent`/`platform_admin`. Renaming requires a migration and
  should be done in Wave 3 with evidence, not by reinterpretation.
- Every `supabase/*.sql` file ends with a commented rollback block; all are
  additive and have been applied to the production Supabase project.
- Guest single-ticket access links (#28) were deferred because guest
  tickets are not allowed.
- Scanner mode is `none`; uploads show a "Not virus-scanned" badge until an
  admin marks them safe or a scanner is configured.
- PR #29 must remain unmerged until the live evaluation passes; the
  grounded provider must first run in shadow mode on Preview, never be
  enabled globally on merge.
