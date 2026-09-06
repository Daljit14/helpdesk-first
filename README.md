# HelpDesk First

Level-1 IT support self-service portal built with Next.js, TypeScript, and Tailwind CSS.

**Production:** https://helpdesk-first.vercel.app

## What it does

HelpDesk First helps users resolve common Level-1 IT problems without needing to run the website locally. It includes a searchable knowledge base of 100 common support issues, category and platform filters, and a guided troubleshooting flow with success feedback and escalation reports.
Network-related guides also include a browser-based network check widget for measuring connectivity to this site.

Cloud features include installable/offline PWA support, ticket screenshots,
live ticket status, web push alerts, and a public system status page. Apply
[`supabase/cloud-features.sql`](supabase/cloud-features.sql) after the base
schema, then configure the service-role key, webhook secret, VAPID keys, and
optional Sentry variables from `.env.example`. Wire the Supabase ticket
webhook to `/api/push/ticket-webhook`; Sentry and push notifications are
no-ops when unconfigured.

## Accounts (Supabase)

Optional accounts power bookmarks, saved guide progress, guide ratings, and support tickets. Apply [`supabase/schema.sql`](supabase/schema.sql), then set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your environment. Password reset uses Supabase email; add `<site>/auth/callback` to the Supabase Redirect URL allowlist (the existing `https://helpdesk-first.vercel.app/**` wildcard covers it). The site works without these variables; accounts are simply disabled.

## AI rate limiting

For production, set `HELP_DESK_AI_RATE_LIMIT_PROVIDER=upstash` and configure `UPSTASH_REDIS_REST_URL` plus `UPSTASH_REDIS_REST_TOKEN` (or connect the Vercel Upstash integration, which provides `KV_REST_API_URL` / `KV_REST_API_TOKEN`) to use a distributed Upstash Redis limiter. Keep the provider set to `memory` for local development and previews.

## Operations export

Apply [`supabase/operations.sql`](supabase/operations.sql), then set
`OPERATIONS_EXPORT_KEY`, optional `OPERATIONS_PSEUDONYM_SALT`, and
the secure admin dashboard variables in `.env.example`. Export with
`curl -H "Authorization: Bearer $OPERATIONS_EXPORT_KEY" https://your-site.example/api/admin/operations/export`.
The response maps to `LiveTicketsTable`: Ticket ID, Created At, Updated At,
Status, Priority, Category, Issue Title, User Key, Assigned Agent, SLA Due,
First Response At, Resolved At, Platform, and Has Attachment. Age Minutes and
SLA State remain Excel formulas. Traffic and agent queue data map to
`TrafficTimelineTable` and `AgentQueueTable`.

## Admin operations dashboard

The role-based dashboard is controlled by `HELP_DESK_ADMIN_DASHBOARD_ENABLED`
and `HELP_DESK_ADMIN_SESSION_SECRET`. It also requires
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `OPERATIONS_PSEUDONYM_SALT` (or
`OPERATIONS_EXPORT_KEY`) for pseudonymous user keys,
`HELP_DESK_AI_RATE_LIMIT_PROVIDER`, and the corresponding Upstash variables
when using the Upstash provider. Apply
`supabase/schema.sql`, `supabase/cloud-features.sql`,
`supabase/operations.sql`, then `supabase/admin-dashboard.sql`.

Invite an operator after applying the migrations:

```sql
insert into public.organization_members (organization_id, user_id, role)
values ('00000000-0000-0000-0000-000000000001', '<auth-user-uuid>', 'support_agent');
```

Set `admin_profiles.mfa_enrolled` to `true` only after the operator has MFA
enrolled; that operator must then authenticate at assurance level AAL2.

Agents can change ticket status, priority, and assignee from the protected
ticket detail page; each change is audited as `ticket.update`.
Retention may be scheduled with pg_cron using the commented schedule in
`supabase/admin-dashboard.sql`; the API also invokes retention opportunistically.
Rollback statements in that migration are destructive and require explicit
approval.

When `HELP_DESK_TICKET_WORKFLOW_ENABLED=true` after applying
`supabase/ticket-workflow.sql`, the detail page also supports AI/employee
routing, public replies, internal notes, verification, and SLA tracking.
Overdue notifications are checked when the operations dashboard loads or
refreshes; they are dashboard-triggered rather than cron-driven.

## Resolution tracking (Phase 5I.3)

Apply `supabase/resolution-tracking.sql` after `supabase/admin-dashboard.sql`,
then set `HELP_DESK_RESOLUTION_TRACKING_ENABLED=true`. A ticket is AI-solved
only when the signed-in user clicks **Problem solved** on the recommended guide;
escalated tickets are never AI-solved. The migration tracks AI attempts,
recommended guides, resolution source, escalation, user confirmation, private
escalation reasons, and private agent summaries. Anonymous assistant users are
not tracked as tickets. Rollback statements are commented out and require
explicit approval.

## Requirements

- [Node.js](https://nodejs.org/) 20 or later
- [npm](https://www.npmjs.com/) 10 or later

## Getting started

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/Daljit14/helpdesk-first.git
   cd helpdesk-first
   npm install
   ```

2. Copy the example environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to view the app.

## Public deployment

This project is deployed on **Vercel**. The production branch is `main`; every push to `main` triggers a production deployment.

Vercel configuration:

- Framework preset: Next.js
- Build command: default (`next build`)
- Output directory: default
- Supabase is optional for accounts and saved user data
- No secret API keys required

### Production URL

The canonical production URL is: **https://helpdesk-first.vercel.app**

### Configuring the site URL

`sitemap.xml` and `robots.txt` use an absolute site URL resolved at build time from, in order:

1. `NEXT_PUBLIC_SITE_URL` — set this in Vercel Project Settings → Environment variables for the most stable, custom domain.
2. `VERCEL_PROJECT_PRODUCTION_URL` — provided automatically for Vercel production deployments.
3. `VERCEL_URL` — provided automatically for Vercel preview deployments.
4. `http://localhost:3000` — used only during local development.

The helper normalizes the value to include `https://` in production and removes any trailing slash.

You do not need to run the website on `localhost` to use the live public version.

## Available scripts

| Script                 | Purpose                              |
| ---------------------- | ------------------------------------ |
| `npm run dev`          | Run the Next.js development server   |
| `npm run build`        | Build the production application     |
| `npm run start`        | Start the production server          |
| `npm run lint`         | Run ESLint                           |
| `npm run format`       | Format files with Prettier           |
| `npm run format:check` | Check formatting with Prettier       |
| `npm run typecheck`    | Run TypeScript with `--noEmit`       |
| `npm run test`         | Run unit tests with Vitest           |
| `npm run test:e2e`     | Run end-to-end tests with Playwright |

## Playwright setup

Install the browsers required by Playwright before running end-to-end tests:

```bash
npx playwright install --with-deps
```

## Continuous integration

A GitHub Actions workflow runs on every pull request and push to `main`:

```
npm ci
npm run lint
npm run typecheck
npm run format:check
npm run test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

## Project structure

```
├── app/              # Next.js App Router pages and layout
├── components/       # React components, including shadcn/ui
├── lib/              # Shared utilities and data
├── public/           # Static assets
├── tests/e2e/        # Playwright end-to-end tests
├── .env.example      # Environment-variable placeholders
└── README.md         # This file
```
