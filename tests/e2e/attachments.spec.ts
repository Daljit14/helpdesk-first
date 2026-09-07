import { expect, test } from "@playwright/test";

test("unauthenticated ticket form does not expose secure uploader", async ({
  page,
}) => {
  await page.goto("/issues/wifi-disconnecting");
  await expect(page.getByText("Attach images or PDFs")).toHaveCount(0);
});

test("authenticated secure attachment upload reaches Ready", async ({
  page,
}) => {
  test.skip(
    !process.env.USER_E2E_EMAIL || !process.env.USER_E2E_PASSWORD,
    "Set requester E2E credentials for secure attachment coverage."
  );
  await page.goto("/login?next=/issues/wifi-disconnecting");
  await page.getByLabel("Email").fill(process.env.USER_E2E_EMAIL!);
  await page.getByLabel("Password").fill(process.env.USER_E2E_PASSWORD!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.goto("/issues/wifi-disconnecting");
  await page.getByRole("button", { name: /submit a ticket/i }).click();
  await expect(page.getByText("Attach images or PDFs")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  await expect(page.getByText("Ready")).toBeVisible();
});
