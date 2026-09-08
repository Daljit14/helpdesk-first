import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const hasAdminCredentials = Boolean(
  process.env.ADMIN_E2E_EMAIL && process.env.ADMIN_E2E_PASSWORD
);

test("admin knowledge governance table is accessible", async ({ page }) => {
  test.skip(
    !hasAdminCredentials ||
      process.env.HELP_DESK_KNOWLEDGE_GOVERNANCE_ENABLED !== "true",
    "Set admin E2E credentials and enable knowledge governance."
  );
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(process.env.ADMIN_E2E_EMAIL!);
  await page.getByLabel("Password").fill(process.env.ADMIN_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto("/admin/knowledge");
  await expect(
    page.getByRole("heading", { name: "Approved support guides" })
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Title" })).toBeVisible();
  await expect(page.getByText("History").first()).toBeVisible();
  const results = await new AxeBuilder({ page })
    .exclude("header")
    .exclude("footer")
    .analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? "")
    )
  ).toEqual([]);
});
