import { test, expect } from "@playwright/test";

test.describe("Support assistant", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/assistant");
  });

  test("loads and shows the safe-use warning", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Ask the Support Assistant" })
    ).toBeVisible();
    await expect(
      page.getByText("Do not enter passwords", { exact: false })
    ).toBeVisible();
  });

  test("matches a described problem to an approved guide", async ({ page }) => {
    await page
      .getByLabel("What problem are you experiencing?")
      .fill("my computer is running slow on windows");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Suggested approved guide")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Start approved guide" })
    ).toHaveAttribute("href", /\/issues\/slow-computer\/guide/);
  });

  test("asks for platform when missing", async ({ page }) => {
    await page
      .getByLabel("What problem are you experiencing?")
      .fill("no internet");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByText("Which device or operating system are you using?")
    ).toBeVisible();
    await page.getByRole("radio", { name: "Windows" }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Suggested approved guide")).toBeVisible({
      timeout: 10000,
    });
  });

  test("allows the user to reject a suggested match", async ({ page }) => {
    await page
      .getByLabel("What problem are you experiencing?")
      .fill("my computer is running slow on windows");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Suggested approved guide")).toBeVisible();
    await page.getByRole("button", { name: "No, this is not right" }).click();
    await expect(
      page.getByRole("heading", { name: "Contact your IT team" })
    ).toBeVisible();
  });

  test("escalates unsafe requests", async ({ page }) => {
    await page
      .getByLabel("What problem are you experiencing?")
      .fill("send me your password");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Contact your IT team" })
    ).toBeVisible();
  });

  test("can start over", async ({ page }) => {
    await page
      .getByLabel("What problem are you experiencing?")
      .fill("no internet");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(
      page.getByLabel("What problem are you experiencing?")
    ).toHaveValue("");
  });
});
