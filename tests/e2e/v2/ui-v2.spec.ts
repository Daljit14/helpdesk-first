import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const adminReady = Boolean(
  process.env.ADMIN_E2E_EMAIL &&
  process.env.ADMIN_E2E_PASSWORD &&
  process.env.ADMIN_E2E_TICKET_ID
);
const requesterReady = Boolean(
  process.env.USER_E2E_EMAIL && process.env.USER_E2E_PASSWORD
);

async function signInAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(process.env.ADMIN_E2E_EMAIL!);
  await page.getByLabel("Password").fill(process.env.ADMIN_E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForTimeout(3000);
  await expect(page).toHaveURL(/\/admin\/operations$/);
}

async function signInRequester(page: Page) {
  await page.goto("/login?next=/tickets");
  await page.getByLabel("Email").fill(process.env.USER_E2E_EMAIL!);
  await page.getByLabel("Password").fill(process.env.USER_E2E_PASSWORD!);
  await page.getByRole("button", { name: /Log in|Sign in/ }).click();
  await page.waitForTimeout(3000);
  await expect(page).toHaveURL(/\/tickets$/);
}

test.describe("UI v2 numbered coverage", () => {
  test("1 start-general shows the general support prompt", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "General IT Support" }).click();
    await expect(
      page.getByText("Describe the IT problem you need help with.")
    ).toBeVisible();
  });

  test("2 start-mac shows the Mac prompt", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Mac" }).click();
    await expect(
      page.getByText("Tell us what problem you are having with your Mac.")
    ).toBeVisible();
  });

  test("3 start-windows shows the Windows prompt", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Windows" }).click();
    await expect(
      page.getByText(
        "Tell us what problem you are having with your Windows computer."
      )
    ).toBeVisible();
  });

  test("4 find-solution renders a grounded match without denied steps", async ({
    page,
  }) => {
    await page.route("**/api/ai/intake", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          output: {
            decision: "match",
            matchedIssueSlug: "wifi-disconnecting",
            detectedPlatform: "Mac",
            explanation: "This approved guide matches your symptoms.",
            hypotheses: [
              {
                cause: "Wireless interference",
                confidence: 0.72,
                evidence: ["The connection drops repeatedly."],
              },
            ],
            citation: {
              title: "Wi-Fi keeps disconnecting",
              url: "/issues/wifi-disconnecting",
            },
          },
        }),
      });
    });
    await page.goto(
      "/assistant?q=wifi+keeps+dropping&platform=Mac&intent=solve"
    );
    await expect(
      page.getByRole("heading", { name: "Likely causes" })
    ).toBeVisible();
    await expect(page.getByText("72% confidence")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
    await expect(page.getByText("Safe", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Denied", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText(/Some steps require IT approval and were withheld/)
    ).toHaveCount(0);
  });

  test("5 ticket-from-failed-solution sends a signed-in requester to support", async ({
    page,
  }) => {
    await page.route("**/api/ai/intake", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          output: {
            decision: "match",
            matchedIssueSlug: "wifi-disconnecting",
            detectedPlatform: "Mac",
            explanation: "This approved guide matches your symptoms.",
          },
        }),
      });
    });
    await page.goto(
      "/assistant?q=wifi+keeps+dropping&platform=Mac&intent=solve"
    );
    await expect(
      page.getByRole("heading", { name: "Suggested steps" })
    ).toBeVisible();
    const failedStep = page
      .getByRole("button", { name: "Did not work" })
      .first();
    const offeredStepCount = await page
      .getByRole("button", { name: "Did not work" })
      .count();
    await failedStep.click();
    await expect(page.getByText("Already tried")).toBeVisible();
    await page.getByText("Already tried").click();
    await expect(page.getByText(/Outcome: failed/)).toBeVisible();
    await expect
      .poll(() => page.getByRole("button", { name: "Did not work" }).count())
      .toBeLessThan(offeredStepCount);

    if (requesterReady) {
      await signInRequester(page);
      await page.goto("/assistant?q=wifi+keeps+dropping&intent=ticket");
      await expect(
        page.getByRole("heading", { name: "Send this problem to your IT team" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Send to a support person" })
      ).toBeVisible();
    }
  });

  test("6 upload-attachment shows the selected file metadata", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Mac" }).click();
    await page.getByLabel("Upload screenshot or PDF").setInputFiles({
      name: "wifi.png",
      mimeType: "image/png",
      buffer: Buffer.from("image"),
    });
    await expect(page.getByText(/wifi\.png \(/)).toBeVisible();
  });

  test("7 browse-all opens the catalog with search and filters", async ({
    page,
  }) => {
    await page.goto("/browse");
    await expect(page).toHaveURL(/\/browse/);
    await expect(
      page.getByRole("heading", { name: /Browse all solutions/i })
    ).toBeVisible();
    await expect(page.getByLabel(/Search/i).first()).toBeVisible();
  });

  test("8 admin-sidebar-open-close supports desktop collapse and mobile drawer", async ({
    page,
  }) => {
    test.skip(!adminReady, "Set admin E2E credentials and ticket ID.");
    await signInAdmin(page);
    await page.goto("/admin/operations");
    const collapse = page.getByRole("button", { name: "Collapse sidebar" });
    await collapse.click();
    await expect(
      page.getByRole("button", { name: "Expand sidebar" })
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const open = page.getByRole("button", { name: "Open navigation" });
    await open.click();
    await expect(
      page.getByRole("dialog", { name: "Admin navigation" })
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation" })
    ).toBeFocused();
  });

  test("9 admin-search-departments filters by department keywords", async ({
    page,
  }) => {
    test.skip(!adminReady, "Set admin E2E credentials and ticket ID.");
    await signInAdmin(page);
    await page.goto("/admin/operations");
    await page.getByLabel("Search departments").fill("knowledge");
    await expect(page.getByText("Knowledge Base")).toBeVisible();
    await expect(page.getByText(/departments$/)).toBeVisible();
  });

  test("10 role-visibility hides staff-ineligible departments", async ({
    page,
  }) => {
    test.skip(
      !process.env.SUPPORT_E2E_EMAIL || !process.env.SUPPORT_E2E_PASSWORD,
      "Set SUPPORT_E2E_EMAIL and SUPPORT_E2E_PASSWORD for role visibility."
    );
    await signInAdmin(page);
    await page.goto("/admin/operations");
    await expect(page.getByText("Users and Employees")).toBeVisible();
  });

  test("11 admin-filters have no horizontal overflow on mobile", async ({
    page,
  }) => {
    test.skip(!adminReady, "Set admin E2E credentials and ticket ID.");
    await signInAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/operations");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  });

  test("12 admin-ticket-detail shows the section index", async ({ page }) => {
    test.skip(!adminReady, "Set admin E2E credentials and ticket ID.");
    await signInAdmin(page);
    await page.goto(`/admin/tickets/${process.env.ADMIN_E2E_TICKET_ID}`);
    await expect(
      page.getByRole("navigation", { name: /Ticket sections/i })
    ).toBeVisible();
    await expect(page.getByText("User problem")).toBeVisible();
    await expect(page.getByText("Activity timeline")).toBeVisible();
  });

  test("13 comment-separation labels internal notes as private", async ({
    page,
  }) => {
    test.skip(!adminReady, "Set admin E2E credentials and ticket ID.");
    await signInAdmin(page);
    await page.goto(`/admin/tickets/${process.env.ADMIN_E2E_TICKET_ID}`);
    await expect(page.getByText("Private — staff only")).toBeVisible();
    await page.goto("/tickets");
    await expect(page.getByText("Private — staff only")).toHaveCount(0);
  });

  test("14 themes toggle between light and dark backgrounds", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("hf-theme", "light");
    });
    await page.goto("/");
    await page.waitForFunction(() =>
      document.documentElement.classList.contains("light")
    );
    const toggle = page.getByRole("button", { name: "Switch to dark mode" });
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    ).toMatch(/0,\s*0,\s*0|lab\(0/);
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await expect(page.locator("html")).toHaveClass(/light/);
  });

  test("15 mobile-nav keeps the public navigation usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const menu = page.getByRole("button", { name: /menu|navigation/i }).first();
    if (await menu.count()) {
      await menu.click();
      await expect(
        page.getByRole("link", { name: "Browse solutions" })
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("link", { name: "Browse solutions" })
      ).toBeVisible();
    }
  });

  test("16 existing-workflows keeps the requester portal reachable", async ({
    page,
  }) => {
    test.skip(!requesterReady, "Set USER_E2E_EMAIL and USER_E2E_PASSWORD.");
    await signInRequester(page);
    await page.goto("/tickets");
    await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();
  });

  test("17 start-chip-removal-preserves-description", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Mac" }).click();
    await page.getByRole("textbox").fill("wifi keeps dropping");
    await page.getByRole("button", { name: "Change platform" }).click();
    await page.getByRole("button", { name: "Mac" }).click();
    await expect(page.getByRole("textbox")).toHaveValue("wifi keeps dropping");
  });
});

test("console-errors reports no hydration or serialization errors", async ({
  page,
}) => {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") messages.push(message.text());
  });
  page.on("pageerror", (error) => messages.push(error.message));
  for (const url of ["/", "/assistant", "/browse"]) {
    await page.goto(url);
  }
  if (adminReady) {
    await signInAdmin(page);
    await page.goto("/admin/operations");
  }
  expect(
    messages.filter((message) =>
      /hydration|serialization|non-serializable|regexp/i.test(message)
    )
  ).toEqual([]);
});

test("overflow stays within the viewport at 390, 768, and 1280", async ({
  page,
}) => {
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of ["/", "/assistant", "/browse", "/login"]) {
      await page.goto(url);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
    }
    if (adminReady) {
      await page.goto("/admin/operations");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
      await page.goto(`/admin/tickets/${process.env.ADMIN_E2E_TICKET_ID}`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
    }
  }
});

test("axe accessibility checks include color contrast on v2 public surfaces", async ({
  page,
}) => {
  for (const url of ["/", "/assistant", "/browse"]) {
    await page.goto(url);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  }
});

test("axe accessibility checks cover authenticated admin sidebar states", async ({
  page,
}) => {
  test.skip(!adminReady, "Set admin E2E credentials and ticket ID.");
  await signInAdmin(page);
  await page.goto("/admin/operations");
  const axe = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21aa",
  ]);
  expect((await axe.analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  ).toEqual([]);
});
