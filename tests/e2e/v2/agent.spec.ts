import { expect, test } from "@playwright/test";

const requesterReady = Boolean(
  process.env.USER_E2E_EMAIL &&
  process.env.USER_E2E_PASSWORD &&
  process.env.E2E_ORG_ID
);

test.describe("requester agent C1", () => {
  test.skip(!requesterReady, "requester credentials or E2E_ORG_ID unavailable");

  test("runs the Wi-Fi flow and offers a human handoff", async ({ page }) => {
    await page.route("**/api/ai/agent", async (route) => {
      const body = route.request().postDataJSON() as {
        humanRequested?: boolean;
      };
      const events = body.humanRequested
        ? [
            {
              type: "session",
              sessionId: "00000000-0000-4000-8000-000000000001",
            },
            {
              type: "escalated",
              ticketId: "00000000-0000-4000-8000-000000000099",
              reason: "user_requested_human",
            },
          ]
        : [
            {
              type: "session",
              sessionId: "00000000-0000-4000-8000-000000000001",
            },
            { type: "tool_started", tool: "search_guides" },
            {
              type: "tool_result_summary",
              tool: "search_guides",
              summary: "3 guides found",
            },
            { type: "tool_started", tool: "get_device_diagnostics" },
            {
              type: "tool_result_summary",
              tool: "get_device_diagnostics",
              summary: "Diagnostics collected recently",
            },
            {
              type: "final_answer",
              text: "Here are the read-only findings.",
              confidence: 0.9,
              evidence: [],
            },
          ];
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: events
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join(""),
      });
    });
    await page.goto("/login?next=/assistant");
    await page.getByLabel("Email").fill(process.env.USER_E2E_EMAIL!);
    await page.getByLabel("Password").fill(process.env.USER_E2E_PASSWORD!);
    await page.getByRole("button", { name: /Log in|Sign in/ }).click();
    await page.goto("/assistant");
    await expect(
      page.getByText("You're talking to an AI assistant")
    ).toBeVisible();
    await page
      .getByLabel("Describe your IT problem")
      .fill("My Wi-Fi keeps dropping");
    await page.getByRole("button", { name: "Ask the assistant" }).click();
    await expect(page.getByText(/Checking search guides/)).toBeVisible();
    await expect(
      page.getByText(/Checking get device diagnostics/)
    ).toBeVisible();
    await expect(
      page.getByText("Here are the read-only findings.")
    ).toBeVisible();
    await page.getByRole("button", { name: "Talk to a human" }).click();
    await expect(
      page.getByText("A support ticket has been created.")
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open ticket" })
    ).toHaveAttribute("href", "/tickets/00000000-0000-4000-8000-000000000099");
  });
});
