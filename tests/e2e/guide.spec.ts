import { test, expect } from "@playwright/test";

test("starts troubleshooting guide from issue page", async ({ page }) => {
  await page.goto("/issues/no-sound");

  await page
    .getByRole("link", { name: /Start troubleshooting guide/i })
    .click();

  await expect(page).toHaveURL(/issues\/no-sound\/guide/);
  await expect(page.getByText(/Step 1 of/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Problem solved/i })
  ).toBeVisible();
});

test("completes guide and rates it helpful", async ({ page }) => {
  await page.goto("/issues/no-sound/guide?platform=Windows");

  await expect(
    page.locator("#main-content").getByText(/Step 1 of 5/)
  ).toBeVisible();

  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "I completed this step" }).click();
  }

  await page.getByRole("button", { name: "I completed this step" }).click();

  await expect(page.getByText("Problem solved")).toBeVisible();
  await page.getByRole("button", { name: "Yes" }).click();

  await expect(page.getByText(/Thank you for your feedback/)).toBeVisible();
});

test("escalates on the final step and generates a report", async ({ page }) => {
  await page.goto("/issues/no-sound/guide?platform=Windows");

  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "I completed this step" }).click();
  }

  await page.getByRole("button", { name: "This did not work" }).click();

  await expect(page.getByText("This problem is unresolved")).toBeVisible();

  await page
    .getByLabel(/Why could you not resolve this problem/)
    .fill("I do not have permission to restart the device");
  await page.getByRole("button", { name: "Generate report" }).click();

  await expect(page.getByText(/Attempted steps:/)).toBeVisible();
  await expect(
    page.getByText(/I do not have permission to restart the device/)
  ).toBeVisible();
});

test("downloads escalation report as a text file", async ({ page }) => {
  await page.goto("/issues/no-sound/guide?platform=Windows");

  await page
    .getByRole("button", { name: "I cannot complete this step" })
    .click();

  await page.getByLabel(/Why could you not resolve/).fill("Need IT help");
  await page.getByRole("button", { name: "Generate report" }).click();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download report" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/escalation-no-sound/);
});

test("restarts guide from success screen", async ({ page }) => {
  await page.goto("/issues/no-sound/guide?platform=Windows");

  await page.getByRole("button", { name: "Problem solved" }).click();
  await expect(page.getByText("Problem solved")).toBeVisible();

  await page.getByRole("button", { name: /Restart the guide/i }).click();
  await expect(page.getByText(/Step 1 of 5/)).toBeVisible();
});

test("404 page is shown for an invalid issue route", async ({ page }) => {
  await page.goto("/issues/does-not-exist");

  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(page.getByText("404")).toBeVisible();
});
