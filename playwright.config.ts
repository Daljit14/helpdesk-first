import { defineConfig, devices } from "@playwright/test";

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
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    env: {
      HELP_DESK_AI_ENABLED: "true",
      NEXT_PUBLIC_AI_ENABLED: "true",
      HELP_DESK_AI_RATE_LIMIT_PROVIDER: "memory",
      HELP_DESK_AI_RATE_LIMIT_MAX: "10000",
      HELP_DESK_ADMIN_DASHBOARD_ENABLED: "true",
      HELP_DESK_RESOLUTION_TRACKING_ENABLED: "true",
    },
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
