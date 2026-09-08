import { describe, expect, test, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/notifications/sla-scan", () => ({ scanSla: vi.fn() }));
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchPending: vi.fn() }));

describe("notifications-dispatch cron", () => {
  test("rejects requests without CRON_SECRET", async () => {
    const request = new Request(
      "http://localhost/api/cron/notifications-dispatch",
      {
        headers: {},
      }
    );
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  test("runs scan and dispatch with valid secret", async () => {
    const { scanSla } = await import("@/lib/notifications/sla-scan");
    const { dispatchPending } = await import("@/lib/notifications/dispatch");
    vi.mocked(scanSla).mockResolvedValue({
      atRisk: 1,
      firstResponseOverdue: 0,
      resolutionOverdue: 0,
    });
    vi.mocked(dispatchPending).mockResolvedValue({
      sent: 5,
      failed: 0,
      dead: 0,
    });
    const request = new Request(
      "http://localhost/api/cron/notifications-dispatch",
      {
        headers: { Authorization: "Bearer cron-secret" },
      }
    );
    process.env.CRON_SECRET = "cron-secret";
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sla.atRisk).toBe(1);
    expect(body.dispatched.sent).toBe(5);
  });
});
