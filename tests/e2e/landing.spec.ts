import { test, expect } from "@playwright/test";

test("homepage renders with an accessible main landmark", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/HelpDesk First/);
  await expect(page.locator("main")).toBeVisible();
});
