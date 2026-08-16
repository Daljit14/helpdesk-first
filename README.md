# HelpDesk First

AI-powered helpdesk foundation built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [npm](https://www.npmjs.com/) 10 or later
- A [Supabase](https://supabase.com/) project (URL and anon key only needed for runtime)

## Getting started

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/Daljit14/helpdesk-first.git
   cd helpdesk-first
   npm install
   ```

2. Copy the example environment file and fill in your Supabase credentials:

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with values from your Supabase project:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

3. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to view the app.

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

## Project structure

```
├── app/            # Next.js App Router pages and layout
├── lib/            # Shared utilities and helpers
├── public/         # Static assets
├── tests/e2e/      # Playwright end-to-end tests
├── .env.example    # Environment-variable placeholders
└── README.md       # This file
```

## License

[MIT](./LICENSE)
