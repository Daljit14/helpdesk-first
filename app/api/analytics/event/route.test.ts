import { afterEach, describe, expect, test, vi } from "vitest";
import { recordAnalyticsEvent } from "@/lib/analytics/events";
import { POST } from "./route";

vi.mock("@/lib/analytics/events", () => ({
  recordAnalyticsEvent: vi.fn(),
}));

const mockedRecord = vi.mocked(recordAnalyticsEvent);

afterEach(() => {
  vi.unstubAllEnvs();
  mockedRecord.mockReset();
});

function request(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/analytics/event", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("analytics event route", () => {
  test("sanitizes paths and derives guide views", async () => {
    const response = await POST(
      request(
        { type: "page_view", path: "/issues/no-internet?secret=1#top" },
        "hd_vid=visitor-1"
      )
    );
    expect(response.status).toBe(200);
    expect(mockedRecord).toHaveBeenCalledWith({
      eventType: "guide_view",
      path: "/issues/no-internet",
      issueId: "no-internet",
      visitorKey: "visitor-1",
      platform: null,
    });
  });

  test("skips private paths", async () => {
    const response = await POST(
      request({ type: "page_view", path: "/admin/operations" })
    );
    expect(await response.json()).toEqual({ ok: true, skipped: true });
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  test("sets a visitor cookie when absent", async () => {
    const response = await POST(request({ type: "page_view", path: "/" }));
    expect(response.headers.get("set-cookie")).toContain("hd_vid=");
    expect(mockedRecord).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "page_view", path: "/" })
    );
  });
});
