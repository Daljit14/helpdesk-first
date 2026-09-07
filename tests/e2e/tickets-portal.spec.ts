import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("requester ticket portal is available to an authenticated user", async ({
  page,
}) => {
  test.skip(
    !process.env.USER_E2E_EMAIL || !process.env.USER_E2E_PASSWORD,
    "Set user E2E credentials for authenticated portal coverage."
  );
  await page.goto("/login?next=/tickets");
  await page.getByLabel("Email").fill(process.env.USER_E2E_EMAIL!);
  await page.getByLabel("Password").fill(process.env.USER_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.goto("/tickets");
  await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();
  await expect(page.getByText("Open tickets")).toBeVisible();
  await expect(page.getByText("Previous tickets")).toBeVisible();
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
