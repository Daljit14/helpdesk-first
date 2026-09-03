import { expect, test } from "@playwright/test";

test("network issue pages offer a network check", async ({ page }) => {
  await page.goto("/issues/no-internet");

  await expect(
    page.locator("#main-content").getByText("Network check", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Run network check" }).click();

  await expect(page.getByText("Online")).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText(
      /Connection looks healthy|Latency is high|Download speed is low|Latency is inconsistent/
    )
  ).toBeVisible({ timeout: 20_000 });
});

test("non-network issue pages do not offer a network check", async ({
  page,
}) => {
  await page.goto("/issues/slow-computer");

  await expect(page.getByText("Network check")).toHaveCount(0);
});

test("network check API routes respond successfully", async ({ request }) => {
  const ping = await request.get("/api/network-check/ping");
  expect(ping.ok()).toBe(true);
  expect(await ping.json()).toMatchObject({ ok: true });

  const payload = await request.get("/api/network-check/payload?bytes=1000");
  expect(payload.ok()).toBe(true);
  expect(await payload.body()).toHaveLength(1000);
  expect(payload.headers()["content-type"]).toContain(
    "application/octet-stream"
  );
});
