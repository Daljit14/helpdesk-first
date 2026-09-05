import { expect, test } from "@playwright/test";

test("operations routes remain private", async ({ page, request }) => {
  const exportResponse = await request.get("/api/admin/operations/export");
  expect([401, 503]).toContain(exportResponse.status());

  await page.goto("/admin/operations");
  await expect(page).toHaveURL(/\/login\?next=\/admin\/operations/);
});
