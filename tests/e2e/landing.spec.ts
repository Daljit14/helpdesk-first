import { test, expect, type Locator, type Page } from "@playwright/test";

function searchInput(page: Page) {
  return page
    .locator('input[placeholder="Describe your problem…"]:visible')
    .first();
}

function matchingCount(page: Page) {
  return page
    .locator('p[aria-live="polite"]:visible')
    .filter({ hasText: /matching problems?/ })
    .first();
}

function searchButton(page: Page) {
  return page.getByRole("button", { name: "Search", exact: true });
}

async function openMobileFilters(page: Page) {
  if ((await page.evaluate(() => window.innerWidth)) >= 1024) return;
  const filters = page.getByRole("button", { name: "Filters" }).first();
  if (await filters.isVisible().catch(() => false)) {
    await filters.click();
    await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
  }
}

function mobileFilters(page: Page) {
  return page.getByRole("dialog", { name: "Filters" });
}

async function filterControls(page: Page): Promise<Locator> {
  return (await page.evaluate(() => window.innerWidth)) < 1024
    ? mobileFilters(page)
    : page.locator('aside[aria-label="Filters"]');
}

test("homepage renders with search, categories and platform filters", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/HelpDesk First/);
  await expect(page.locator("main")).toBeVisible();

  await expect(searchInput(page)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Ask the Support Assistant/i })
  ).toHaveAttribute("href", "/assistant");
  await expect(
    page.getByRole("heading", { name: "Browse by category" })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Popular guides" })
  ).toBeVisible();

  await openMobileFilters(page);
  for (const label of [
    "Computer",
    "Internet & Wi-Fi",
    "Printer",
    "Email",
    "Software",
    "Audio & camera",
  ]) {
    await expect(
      page.getByRole("button", { name: new RegExp(label, "i") }).first()
    ).toBeVisible();
  }

  for (const platform of ["Windows", "Mac", "iOS", "Android", "Other"]) {
    await expect(
      page
        .getByRole("button", { name: new RegExp(`^${platform}$`, "i") })
        .first()
    ).toBeVisible();
  }
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
  await searchButton(page).click();

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

  await openMobileFilters(page);
  const categoryFilters = await filterControls(page);
  await categoryFilters.getByRole("button", { name: /^Computer$/i }).click();
  await openMobileFilters(page);
  const platformFilters = await filterControls(page);
  await platformFilters.getByRole("button", { name: /^Windows$/i }).click();

  await expect(
    page
      .getByLabel("Search results")
      .getByRole("link", { name: /Slow computer/i })
  ).toBeVisible();
  await expect(matchingCount(page)).toBeVisible();
});

test("browser back restores the previous search filter state", async ({
  page,
}) => {
  await page.goto("/");
  await searchInput(page).fill("printer");
  await searchButton(page).click();
  await openMobileFilters(page);
  const filters = await filterControls(page);
  await filters.getByRole("button", { name: /^Computer$/i }).click();

  await expect(page).toHaveURL(/\?q=printer&category=computer/);
  await page.goBack();

  await expect(page).toHaveURL(/\?q=printer$/);
  await expect(searchInput(page)).toHaveValue("printer");
  await expect(
    page.getByRole("button", { name: "Remove filter: Search printer" })
  ).toBeVisible();
});

test("removing an active filter clears only that filter", async ({ page }) => {
  await page.goto("/?q=printer&category=printer&platform=Windows");

  await page
    .getByRole("button", {
      name: "Remove filter: Platform Windows",
    })
    .click();

  await expect(page).toHaveURL(/\?q=printer&category=printer$/);
  await expect(searchInput(page)).toHaveValue("printer");
  await expect(
    page.getByRole("button", { name: "Remove filter: Search printer" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove filter: Category printer" })
  ).toBeVisible();
});

test("clearing filters resets results", async ({ page }) => {
  await page.goto("/");

  await searchInput(page).fill("printer");
  await page.getByRole("button", { name: /Clear all filters/i }).click();

  await expect(searchInput(page)).toHaveValue("");
  await expect(
    page.getByRole("heading", { name: "Browse by category" })
  ).toBeVisible();
});

test("user can open an issue and return to previous filtered results", async ({
  page,
}) => {
  await page.goto("/");

  await searchInput(page).fill("printer");
  await searchButton(page).click();
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
    (url) => url.pathname === "/browse" && url.search === "?q=printer"
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

  await searchInput(page).fill("qzxv");

  await expect(page.getByText(/No matching problems found/)).toBeVisible();
  await expect(
    page.getByText("0 matching problems", { exact: true })
  ).toBeVisible();
});
