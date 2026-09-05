import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("admin dashboard requires the role-based sign in", async ({ page }) => {
  await page.goto("/admin/operations");
  await expect(page).toHaveURL(/\/admin\/login\?next=\/admin\/operations/);
  await expect(
    page.getByRole("heading", { name: "Admin sign in" })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /sign up/i })).toHaveCount(0);
});

test("admin routes are not indexed", async ({ request }) => {
  const response = await request.get("/admin/login");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain('name="robots"');
});

test("admin login has no serious accessibility violations", async ({
  page,
}) => {
  await page.goto("/admin/login");
  const results = await new AxeBuilder({ page })
    .exclude("header")
    .exclude("footer")
    .analyze();
  expect(
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? "")
    )
  ).toEqual([]);
});

test("admin APIs and analytics enforce their contracts", async ({
  request,
}) => {
  const adminResponse = await request.get("/api/admin/operations");
  expect(adminResponse.status()).toBe(401);

  const unknown = await request.post("/api/analytics/event", {
    data: { type: "page_view", path: "/", extra: true },
  });
  expect(unknown.status()).toBe(400);

  const heartbeat = await request.post("/api/analytics/event", {
    data: { type: "heartbeat", path: "/" },
  });
  expect(heartbeat.status()).toBe(200);

  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Disallow: /admin");
});
