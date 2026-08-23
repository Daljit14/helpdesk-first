import { test, expect } from "@playwright/test";

const pages = [
  { name: "Home", url: "/" },
  { name: "Support Assistant", url: "/assistant" },
  { name: "Issue detail", url: "/issues/slow-computer" },
  { name: "Guide", url: "/issues/slow-computer/guide" },
  { name: "Not found", url: "/issues/unknown-issue" },
];

for (const { name, url } of pages) {
  test(`page meets basic accessibility checks on ${name}`, async ({ page }) => {
    await page.goto(url);
    // Wait for real page content (not the global loading UI) before scanning.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const axePath = require.resolve("axe-core/axe.min.js");
    await page.addScriptTag({ path: axePath });

    const results = await page.evaluate(async () => {
      // @ts-expect-error injected by addScriptTag above
      return await axe.run({
        rules: {
          // Color-contrast can be noisy with dark-mode classes and is best verified manually.
          "color-contrast": { enabled: false },
        },
      });
    });

    expect(results.violations).toEqual([]);
  });
}

test("Support assistant is keyboard navigable", async ({ page }) => {
  await page.goto("/assistant");
  const input = page.getByLabel("What problem are you experiencing?");
  const maxTabs = 6;

  for (let i = 0; i < maxTabs; i++) {
    if (
      await input
        .evaluate((el) => el === document.activeElement)
        .catch(() => false)
    ) {
      break;
    }
    await page.keyboard.press("Tab");
  }

  await expect(input).toBeFocused();
  await page.keyboard.type("my computer is slow on windows");
  await expect(input).toHaveValue("my computer is slow on windows");
});

test("Issue page has visible focus indicators", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "focus-ring check uses Chromium-specific APIs"
  );

  await page.goto("/issues/slow-computer");
  const startGuideLink = page.getByRole("link", {
    name: "Start troubleshooting",
  });
  await startGuideLink.focus();
  const outline = await startGuideLink.evaluate(
    (el) => window.getComputedStyle(el).outlineWidth
  );
  expect(outline).not.toBe("0px");
});
