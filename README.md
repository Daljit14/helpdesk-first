# HelpDesk First

Level-1 IT support self-service portal built with Next.js, TypeScript, and Tailwind CSS.

**Production:** https://helpdesk-first.vercel.app

## What it does

HelpDesk First helps users resolve common Level-1 IT problems without needing to run the website locally. It includes a searchable knowledge base of 100 common support issues, category and platform filters, and a guided troubleshooting flow with success feedback and escalation reports.

## Accounts (Supabase)

Optional accounts power bookmarks, saved guide progress, guide ratings, and support tickets. Apply [`supabase/schema.sql`](supabase/schema.sql), then set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your environment. Password reset uses Supabase email; add `<site>/auth/callback` to the Supabase Redirect URL allowlist (the existing `https://helpdesk-first.vercel.app/**` wildcard covers it). The site works without these variables; accounts are simply disabled.

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
