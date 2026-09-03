import { test, expect } from "@playwright/test";

test("cloud feature pages and manifest are available", async ({
  page,
  request,
}) => {
  await page.goto("/status");
  await expect(
    page.getByRole("heading", { name: "System status" })
  ).toBeVisible();

  await page.goto("/offline");
  await expect(
    page.getByRole("heading", { name: "You're offline" })
  ).toBeVisible();

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(manifest.headers()["content-type"]).toContain(
    "application/manifest+json"
  );
  await expect(manifest.json()).resolves.toMatchObject({
    name: "HelpDesk First",
  });
});
