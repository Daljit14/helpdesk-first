import { test, expect } from "@playwright/test";

test("login links to the password reset form", async ({ page }) => {
  await page.goto("/login");

  await page.getByRole("link", { name: "Forgot password?" }).click();

  await expect(page).toHaveURL("/forgot-password");
  await expect(
    page.getByRole("heading", { name: "Reset your password" })
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("expired reset links show an explanation", async ({ page }) => {
  await page.goto("/forgot-password?error=expired");

  await expect(
    page
      .locator("#main-content")
      .getByText(
        "That reset link is invalid or has expired. Request a new one below."
      )
  ).toBeVisible();
});

test("callback without a code returns to login", async ({ page }) => {
  await page.goto("/auth/callback");

  await expect(page).toHaveURL("/login");
});

test("reset password without a session returns to forgot password", async ({
  page,
}) => {
  await page.goto("/reset-password");

  await expect(page).toHaveURL("/forgot-password?error=expired");
});

test("forgot password reports when accounts are disabled", async ({ page }) => {
  await page.goto("/forgot-password");

  await page.getByLabel("Email").fill("user@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(
    page.getByText("Accounts are not enabled on this deployment.")
  ).toBeVisible();
});

test("invalid invitations preserve the sign-in destination", async ({
  page,
}) => {
  await page.goto("/invite/bad-token");
  await expect(page).toHaveURL("/login?next=%2Finvite%2Fbad-token");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("SSO buttons appear only for enabled providers", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Continue with Google" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Microsoft" })
  ).toBeVisible();
});
