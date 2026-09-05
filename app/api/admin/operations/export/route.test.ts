import { afterEach, describe, expect, test, vi } from "vitest";
import { getOperationsSnapshot } from "@/lib/operations/snapshot";
import { GET } from "./route";

vi.mock("@/lib/operations/snapshot", () => ({
  getOperationsSnapshot: vi.fn(),
}));

const mockedSnapshot = vi.mocked(getOperationsSnapshot);

afterEach(() => {
  vi.unstubAllEnvs();
  mockedSnapshot.mockReset();
});

function request(key?: string) {
  return new Request("http://localhost/api/admin/operations/export", {
    headers: key ? { Authorization: `Bearer ${key}` } : undefined,
  });
}

describe("operations export", () => {
  test("returns 503 when unconfigured", async () => {
    vi.stubEnv("OPERATIONS_EXPORT_KEY", "");
    expect((await GET(request("key"))).status).toBe(503);
  });

  test("returns 401 for an invalid key", async () => {
    vi.stubEnv("OPERATIONS_EXPORT_KEY", "expected");
    expect((await GET(request("wrong"))).status).toBe(401);
  });

  test("returns a privacy-safe snapshot", async () => {
    vi.stubEnv("OPERATIONS_EXPORT_KEY", "expected");
    mockedSnapshot.mockResolvedValue({
      generatedAt: "2025-01-01T00:00:00.000Z",
      liveTickets: [
        {
          ticketId: "TCK-12345678",
          createdAt: "2025-01-01T00:00:00.000Z",
          updatedAt: "2025-01-01T00:00:00.000Z",
          status: "New",
          priority: "Normal",
          category: "Computer",
          issueTitle: "Slow computer",
          userKey: "usr_12345678",
          assignedAgent: "Ada",
          slaDue: "2025-01-02T00:00:00.000Z",
          firstResponseAt: null,
          resolvedAt: null,
          platform: "Windows",
          hasAttachment: false,
        },
      ],
      trafficTimeline: {
        timestamp: "2025-01-01T00:00:00.000Z",
        activeUsers5m: 1,
        pageViewsPerMin: 1,
        uniqueVisitorsToday: 1,
        sessionsToday: 1,
        guideViewsPerMin: 0,
        assistantStartsPerMin: 0,
        ticketsCreatedPerMin: 0,
      },
      agentQueue: [],
    });
    const response = await GET(request("expected"));
    expect(response.status).toBe(200);
    const json = JSON.stringify(await response.json());
    expect(json).not.toContain("message");
    expect(json).not.toContain("user_id");
    expect(json).not.toContain("attachment_path");
    expect(json).not.toContain("@");
  });
});
