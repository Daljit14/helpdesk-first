import { afterEach, describe, expect, test, vi } from "vitest";
import { sendEmail } from "./email";

describe("sendEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.BREVO_API_KEY;
    delete process.env.NOTIFICATIONS_FROM_EMAIL;
  });

  test("returns permanent error when key is missing", async () => {
    const result = await sendEmail({
      to: "test@example.com",
      subject: "hi",
      text: "body",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("permanent");
  });

  test("classifies 400s as permanent and 500s as retryable", async () => {
    process.env.BREVO_API_KEY = "key";
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", mockFetch);
    const permanent = await sendEmail({
      to: "test@example.com",
      subject: "hi",
      text: "body",
    });
    expect(permanent.error).toContain("permanent");
    const retryable = await sendEmail({
      to: "test@example.com",
      subject: "hi",
      text: "body",
    });
    expect(retryable.error).toContain("retryable");
  });

  test("sends the sender, recipient, and text/html content to Brevo", async () => {
    process.env.BREVO_API_KEY = "key";
    process.env.NOTIFICATIONS_FROM_EMAIL = "HelpDesk First <me@gmail.com>";
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", mockFetch);

    await sendEmail({
      to: "requester@example.com",
      subject: "Ticket update",
      text: "plain body",
      html: "<p>plain body</p>",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "api-key": "key" }),
      })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.sender).toEqual({
      name: "HelpDesk First",
      email: "me@gmail.com",
    });
    expect(body.to).toEqual([{ email: "requester@example.com" }]);
    expect(body.subject).toBe("Ticket update");
    expect(body.textContent).toBe("plain body");
    expect(body.htmlContent).toBe("<p>plain body</p>");
  });
});
