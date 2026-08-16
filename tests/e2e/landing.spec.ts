import { test, expect } from "@playwright/test";

test("homepage renders with search, categories and platform buttons", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/HelpDesk First/);
  await expect(page.locator("main")).toBeVisible();

  const searchInput = page.getByPlaceholder("What problem are you having?");
  await expect(searchInput).toBeVisible();

  const categories = [
    "Computer",
    "Internet and Wi-Fi",
    "Printer",
    "Email",
    "Software",
    "Audio and Camera",
  ];
  for (const label of categories) {
    await expect(
      page.getByRole("button", { name: new RegExp(label, "i") })
    ).toBeVisible();
  }

  for (const platform of ["Windows", "Mac", "Mobile", "Other"]) {
    await expect(
      page.getByRole("button", { name: new RegExp(`^${platform}$`, "i") })
    ).toBeVisible();
  }
});

test("search filters categories", async ({ page }) => {
  await page.goto("/");

  const searchInput = page.getByPlaceholder("What problem are you having?");
  await searchInput.fill("printer");

  await expect(page.getByRole("button", { name: /Printer/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Email/i })).toBeHidden();
});
