import { expect, test } from "@playwright/test";

const requesterReady = Boolean(
  process.env.USER_E2E_EMAIL &&
  process.env.USER_E2E_PASSWORD &&
  process.env.HELP_DESK_REQUESTER_AGENT_ENABLED === "true"
);

test.describe("requester agent C1", () => {
  test.skip(!requesterReady, "requester credentials unavailable");

  test("renders the agent surface when enabled", async ({ page }) => {
    await page.goto("/assistant");
    await expect(
      page.getByText("You're talking to an AI assistant")
    ).toBeVisible();
  });
});
