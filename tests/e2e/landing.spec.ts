import { test, expect } from "@playwright/test";

test("homepage renders with search, categories and platform filters", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/HelpDesk First/);
  await expect(page.locator("main")).toBeVisible();

  await expect(
    page.getByPlaceholder("What problem are you having?")
  ).toBeVisible();

  for (const label of [
    "Computer",
    "Internet and Wi-Fi",
    "Printer",
    "Email",
    "Software",
    "Audio and Camera",
  ]) {
    await expect(
      page.getByRole("button", { name: new RegExp(label, "i") })
    ).toBeVisible();
  }

  for (const platform of ["Windows", "Mac", "Mobile", "Other"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(`^${platform}$`, "i") })
    ).toBeVisible();
  }

  await expect(page.getByText(/matching/)).toBeVisible();
});

test("search updates results as the user types", async ({ page }) => {
  await page.goto("/");

  const searchInput = page.getByPlaceholder("What problem are you having?");
  await searchInput.fill("printer offline");

  await expect(
    page.getByRole("link", { name: /Printer showing offline/i })
  ).toBeVisible();
  await expect(page.getByText(/1 matching problem/)).toBeVisible();
});

test("search submission updates the URL and moves focus to results", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByPlaceholder("What problem are you having?").fill("no sound");
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
    page.getByRole("link", { name: /Printer showing offline/i })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Print job stuck/i })
  ).toBeVisible();
  await expect(page.getByText(/5 matching problems/)).toBeVisible();
});

test("category and platform filters can be combined", async ({ page }) => {
  await page.goto("/");

  await page
    .getByRole("button", { name: new RegExp("^Computer$", "i") })
    .click();
  await page.getByRole("button", { name: /^Windows$/i }).click();

  await expect(
    page.getByRole("link", { name: /Slow computer/i })
  ).toBeVisible();
  await expect(page.getByText(/matching problems?/)).toBeVisible();
});

test("clearing filters resets results", async ({ page }) => {
  await page.goto("/");

  await page.getByPlaceholder("What problem are you having?").fill("printer");
  await page.getByRole("button", { name: /Clear all filters/i }).click();

  await expect(
    page.getByPlaceholder("What problem are you having?")
  ).toHaveValue("");
  await expect(page.getByText(/30 matching problems/)).toBeVisible();
});

test("user can open an issue and return to previous filtered results", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByPlaceholder("What problem are you having?").fill("printer");
  await page.getByRole("button", { name: /Search/i }).click();
  await page.getByRole("link", { name: /Print job stuck/i }).click();

  await expect(page).toHaveURL(/issues\/print-job-stuck\?q=printer/);
  await expect(
    page.getByRole("heading", { name: /Print job stuck/i })
  ).toBeVisible();

  await page.getByRole("link", { name: /Back to results/i }).click();

  await expect(page).toHaveURL(
    (url) => url.pathname === "/" && url.search === "?q=printer"
  );
  await expect(
    page.getByPlaceholder("What problem are you having?")
  ).toHaveValue("printer");
  await expect(
    page.getByRole("link", { name: /Print job stuck/i })
  ).toBeVisible();
});

test("empty search shows a helpful no-results message", async ({ page }) => {
  await page.goto("/");

  await page
    .getByPlaceholder("What problem are you having?")
    .fill("this does not exist");

  await expect(page.getByText(/No matching problems found/)).toBeVisible();
  await expect(page.getByText(/0 matching problems/)).toBeVisible();
});
