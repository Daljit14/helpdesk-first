import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const configured =
  process.env.ADMIN_E2E_EMAIL &&
  process.env.ADMIN_E2E_PASSWORD &&
  process.env.ADMIN_E2E_RESOLUTION_RUN_ID;

test.describe("AI Resolution Center", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !configured,
      "Set admin Resolution Center E2E credentials and run ID."
    );
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(process.env.ADMIN_E2E_EMAIL!);
    await page.getByLabel("Password").fill(process.env.ADMIN_E2E_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
  });

  test("renders the list and detail with accessible controls", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/admin/resolution");
    await expect(
      page.getByRole("heading", { name: "AI Resolution Center" })
    ).toBeVisible();
    const listScan = await new AxeBuilder({ page }).analyze();
    expect(
      listScan.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? "")
      )
    ).toEqual([]);
    await page.goto(
      `/admin/resolution/${process.env.ADMIN_E2E_RESOLUTION_RUN_ID!}`
    );
    await expect(page.getByRole("heading", { name: "Controls" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause AI" })).toBeVisible();
    const detailScan = await new AxeBuilder({ page }).analyze();
    expect(
      detailScan.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? "")
      )
    ).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("pause control confirms before submitting", async ({ page }) => {
    await page.goto(
      `/admin/resolution/${process.env.ADMIN_E2E_RESOLUTION_RUN_ID!}`
    );
    await page.getByRole("button", { name: "Pause AI" }).click();
    await expect(page.getByRole("status")).toBeVisible();
  });
});
