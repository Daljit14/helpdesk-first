import { afterEach, describe, expect, test, vi } from "vitest";
import {
  recordAnalyticsEvent,
  touchActiveSession,
} from "@/lib/analytics/events";
import { POST } from "./route";

vi.mock("@/lib/analytics/events", () => ({
  recordAnalyticsEvent: vi.fn(),
  touchActiveSession: vi.fn(),
}));

const mockedRecord = vi.mocked(recordAnalyticsEvent);
const mockedTouch = vi.mocked(touchActiveSession);

afterEach(() => {
  vi.unstubAllEnvs();
  mockedRecord.mockReset();
  mockedTouch.mockReset();
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
        "hd_sid=visitor-1"
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
    expect(response.headers.get("set-cookie")).toMatch(
      /hd_sid=.*Max-Age=86400/
    );
    expect(mockedRecord).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "page_view", path: "/" })
    );
  });

  test("records assistant starts with a null platform", async () => {
    const response = await POST(
      request({ type: "assistant_started", path: "/assistant", platform: null })
    );
    expect(response.status).toBe(200);
    expect(mockedRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "assistant_start",
        platform: null,
      })
    );
  });

  test("rejects unknown payload keys", async () => {
    const response = await POST(
      request({ type: "page_view", path: "/", extra: true })
    );
    expect(response.status).toBe(400);
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  test("heartbeats touch a session without recording an event", async () => {
    const response = await POST(
      request({ type: "heartbeat", path: "/" }, "hd_sid=session-1")
    );
    expect(response.status).toBe(200);
    expect(mockedTouch).toHaveBeenCalledWith("session-1");
    expect(mockedRecord).not.toHaveBeenCalled();
  });
});
