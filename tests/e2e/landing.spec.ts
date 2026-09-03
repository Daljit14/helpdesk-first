import { test, expect, type Page } from "@playwright/test";

function searchInput(page: Page) {
  return page
    .locator('input[placeholder="What problem are you having?"]:visible')
    .first();
}

function matchingCount(page: Page) {
  return page
    .locator('p[aria-live="polite"]:visible')
    .filter({ hasText: /matching problems?/ })
    .first();
}

test("homepage renders with search, categories and platform filters", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/HelpDesk First/);
  await expect(page.locator("main")).toBeVisible();

  await expect(searchInput(page)).toBeVisible();

  for (const label of [
    "Computer",
    "Internet & Wi-Fi",
    "Printer",
    "Email",
    "Software",
    "Audio & camera",
  ]) {
    await expect(
      page.getByRole("button", { name: new RegExp(label, "i") })
    ).toBeVisible();
  }

  for (const platform of ["Windows", "Mac", "iOS", "Android", "Other"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(`^${platform}$`, "i") })
    ).toBeVisible();
  }

  await expect(matchingCount(page)).toBeVisible();
});

test("search updates results as the user types", async ({ page }) => {
  await page.goto("/");

  await searchInput(page).fill("printer offline");

  await expect(
    page
      .getByLabel("Search results")
      .getByRole("link", { name: /Printer showing offline/i })
  ).toBeVisible();
  await expect(page.getByText(/1 matching problem/)).toBeVisible();
});

test("search submission updates the URL and moves focus to results", async ({
  page,
}) => {
  await page.goto("/");

  await searchInput(page).fill("no sound");
  await page.getByRole("button", { name: /^Search$/i }).click();

  await expect(page).toHaveURL(/\?q=no\+sound/);
  await expect(page.getByLabel("Search results")).toBeFocused();
  await expect(
    page.getByRole("heading", { name: /No sound/i }).first()
  ).toBeVisible();
});

test("URL filter parameters initialize filters and results", async ({
  page,
}) => {
  await page.goto("/?category=printer&platform=Windows");

  await expect(
    page
      .getByLabel("Search results")
      .getByRole("link", { name: /Printer showing offline/i })
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Search results")
      .getByRole("link", { name: /Print job stuck/i })
  ).toBeVisible();
  await expect(
    page.locator("#main-content").getByText(/5 matching problems/)
  ).toBeVisible();
});

test("category and platform filters can be combined", async ({ page }) => {
  await page.goto("/");

  await page
    .getByRole("button", { name: new RegExp("^Computer$", "i") })
    .click();
  await page.getByRole("button", { name: /^Windows$/i }).click();

  await expect(
    page
      .getByLabel("Search results")
      .getByRole("link", { name: /Slow computer/i })
  ).toBeVisible();
  await expect(matchingCount(page)).toBeVisible();
});

test("clearing filters resets results", async ({ page }) => {
  await page.goto("/");

  await searchInput(page).fill("printer");
  await page.getByRole("button", { name: /Clear all filters/i }).click();

  await expect(searchInput(page)).toHaveValue("");
  await expect(page.getByText(/100 matching problems/)).toBeVisible();
});

test("user can open an issue and return to previous filtered results", async ({
  page,
}) => {
  await page.goto("/");

  await searchInput(page).fill("printer");
  await page.getByRole("button", { name: /Search/i }).click();
  await page
    .getByLabel("Search results")
    .getByRole("link", { name: /Print job stuck/i })
    .click();

  await expect(page).toHaveURL(/issues\/print-job-stuck\?q=printer/);
  await expect(
    page.getByRole("heading", { name: /Print job stuck/i })
  ).toBeVisible();

  await page.getByRole("link", { name: /Back to results/i }).click();

  await expect(page).toHaveURL(
    (url) => url.pathname === "/" && url.search === "?q=printer"
  );
  await expect(searchInput(page)).toHaveValue("printer");
  await expect(
    page
      .getByLabel("Search results")
      .getByRole("link", { name: /Print job stuck/i })
  ).toBeVisible();
});

test("legacy issue URLs redirect to the canonical issue id", async ({
  page,
}) => {
  await page.goto("/issues/computer-will-not-start?platform=Windows");

  await expect(page).toHaveURL(
    /\/issues\/computer-wont-start\?platform=Windows/
  );
});

test("empty search shows a helpful no-results message", async ({ page }) => {
  await page.goto("/");

  await searchInput(page).fill("this does not exist");

  await expect(page.getByText(/No matching problems found/)).toBeVisible();
  await expect(page.getByText(/0 matching problems/)).toBeVisible();
});
