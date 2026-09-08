import { afterEach, describe, expect, test, vi } from "vitest";
import { sendEmail } from "./email";

describe("sendEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
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
    process.env.RESEND_API_KEY = "key";
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
});
