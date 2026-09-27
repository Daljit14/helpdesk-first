import { defineConfig, devices } from "@playwright/test";

const sharedEnv = {
  HELP_DESK_AI_ENABLED: "true",
  NEXT_PUBLIC_AI_ENABLED: "true",
  HELP_DESK_AI_RATE_LIMIT_PROVIDER: "memory",
  HELP_DESK_AI_RATE_LIMIT_MAX: "10000",
  HELP_DESK_ADMIN_DASHBOARD_ENABLED: "true",
  HELP_DESK_RESOLUTION_TRACKING_ENABLED: "true",
  HELP_DESK_RESOLUTION_CENTER_ENABLED: "true",
  HELP_DESK_SSO_GOOGLE_ENABLED: "true",
  HELP_DESK_SSO_MICROSOFT_ENABLED: "true",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /v2\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      testIgnore: /v2\/.*\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "v2-chromium",
      testMatch: [
        /v2\/.*\.spec\.ts/,
        /tickets-portal\.spec\.ts/,
        /attachments\.spec\.ts/,
      ],
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3100" },
    },
    {
      name: "v2-mobile",
      testMatch: [
        /v2\/.*\.spec\.ts/,
        /tickets-portal\.spec\.ts/,
        /attachments\.spec\.ts/,
      ],
      use: { ...devices["Pixel 7"], baseURL: "http://localhost:3100" },
    },
    {
      name: "v2-webkit",
      testMatch: [
        /v2\/.*\.spec\.ts/,
        /tickets-portal\.spec\.ts/,
        /attachments\.spec\.ts/,
      ],
      testIgnore: process.env.PLAYWRIGHT_WEBKIT === "true" ? undefined : /.*/,
      use: {
        ...devices["Desktop Safari"],
        baseURL: "http://localhost:3100",
      },
    },
    {
      name: "requester-agent",
      testMatch: /v2\/agent\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3101" },
    },
  ],
  webServer: process.argv.includes("--project=requester-agent")
    ? [
        {
          command:
            "HELP_DESK_NEXT_DIST_DIR=.next-requester-agent npm run dev -- --port 3101",
          env: {
            ...sharedEnv,
            HELP_DESK_NEXT_DIST_DIR: ".next-requester-agent",
            NEXT_PUBLIC_UI_V2_ENABLED: "true",
            HELP_DESK_REQUESTER_AGENT_ENABLED: "true",
            HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED: "true",
            HELP_DESK_AI_PROVIDER: "mock",
            HELP_DESK_REQUESTER_AGENT_ORG_ALLOWLIST:
              process.env.E2E_ORG_ID ?? "",
          },
          url: "http://localhost:3101",
          reuseExistingServer: !process.env.CI,
        },
      ]
    : [
        {
          command: "npm run dev",
          env: sharedEnv,
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
        },
        {
          command:
            "HELP_DESK_NEXT_DIST_DIR=.next-v2 npm run dev -- --port 3100",
          env: {
            ...sharedEnv,
            HELP_DESK_NEXT_DIST_DIR: ".next-v2",
            NEXT_PUBLIC_UI_V2_ENABLED: "true",
          },
          url: "http://localhost:3100",
          reuseExistingServer: !process.env.CI,
        },
      ],
});
