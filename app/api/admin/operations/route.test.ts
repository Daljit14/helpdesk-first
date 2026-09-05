import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";
import { getOperationsData } from "@/lib/admin/operations-data";
import { requireAdminApi, recordAudit } from "@/lib/admin/auth";

vi.mock("@/lib/admin/auth", () => ({
  requireAdminApi: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/admin/operations-data", () => ({
  defaultAdminFilters: vi.fn(() => ({
    from: "2025-01-01T00:00:00.000Z",
    to: "2025-01-31T00:00:00.000Z",
    page: 1,
    pageSize: 25,
  })),
  getOperationsData: vi.fn(),
}));

const session = {
  userId: "user-1",
  email: "agent@example.com",
  role: "support_agent" as const,
  organizationId: "org-1",
  displayName: "Agent",
};

afterEach(() => {
  vi.clearAllMocks();
});

function request(query = "") {
  return new Request(`http://localhost/api/admin/operations${query}`);
}

describe("admin operations route", () => {
  test("returns auth responses unchanged", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue(
      Response.json({ error: "Unauthorized." }, { status: 401 })
    );
    expect((await GET(request())).status).toBe(401);
  });

  test("rejects invalid strict filters", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue(session);
    const response = await GET(request("?unexpected=true"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      expect.objectContaining({ error: "Invalid filters." })
    );
  });

  test("caps date range and records an audit", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue(session);
    vi.mocked(getOperationsData).mockResolvedValue({
      generatedAt: "2025-01-31T00:00:00.000Z",
      organizationId: "org-1",
      role: "support_agent",
      metrics: {
        activeUsers: 0,
        uniqueVisitorsToday: 0,
        pageViewsToday: 0,
        totalTickets: 0,
        openTickets: 0,
        newTickets: 0,
        inProgressTickets: 0,
        waitingTickets: 0,
        urgentOpenTickets: 0,
        completedToday: 0,
        totalCompleted: 0,
        slaBreached: 0,
        avgFirstResponseMinutes: 0,
        avgResolutionMinutes: 0,
        ticketsByCategory: [],
        ticketsByPlatform: [],
        agentWorkload: [],
      },
      tickets: {
        rows: [
          {
            ticketUuid: "00000000-0000-4000-8000-000000000001",
            ticketId: "TCK-00000000",
            createdAt: "2025-01-01T00:00:00.000Z",
            updatedAt: "2025-01-01T00:00:00.000Z",
            lastUpdatedAt: "2025-01-01T00:00:00.000Z",
            status: "New",
            priority: "Normal",
            category: "Network",
            issueTitle: "Internet access",
            userKey: "usr_12345678",
            assignedAgent: "",
            slaDue: "2025-01-02T00:00:00.000Z",
            firstResponseAt: null,
            resolvedAt: null,
            platform: "Other",
            hasAttachment: false,
            slaState: "On track",
          },
        ],
        page: 2,
        pageSize: 10,
        total: 1,
      },
      filters: {
        from: "2025-01-01T00:00:00.000Z",
        to: "2025-01-31T00:00:00.000Z",
        page: 2,
        pageSize: 10,
      },
    });
    const response = await GET(
      request(
        "?from=2020-01-01T00:00:00.000Z&to=2025-01-31T00:00:00.000Z&page=2&pageSize=10"
      )
    );
    expect(response.status).toBe(200);
    const filters = vi.mocked(getOperationsData).mock.calls[0]?.[1];
    expect(filters?.page).toBe(2);
    expect(filters?.pageSize).toBe(10);
    expect(new Date(filters?.from ?? "").getTime()).toBe(
      new Date("2024-11-02T00:00:00.000Z").getTime()
    );
    const body = JSON.stringify(await response.json());
    expect(body).not.toMatch(/message|user_id|attachment_path|@/);
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
      session,
      "operations.view"
    );
  });
});
