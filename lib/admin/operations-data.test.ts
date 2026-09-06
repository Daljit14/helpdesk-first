import { afterEach, expect, test, vi } from "vitest";
import { defaultAdminFilters, getOperationsData } from "./operations-data";
import type { AdminSession } from "./auth";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  isResolutionTrackingEnabled: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("./flags", () => ({
  isResolutionTrackingEnabled: mocks.isResolutionTrackingEnabled,
}));

const session: AdminSession = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "admin",
  organizationId: "org-a",
  displayName: "Admin",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

test("shapes resolution metrics and keeps private fields out of list rows", async () => {
  vi.stubEnv("OPERATIONS_PSEUDONYM_SALT", "test-salt");
  mocks.isResolutionTrackingEnabled.mockReturnValue(true);

  const ticketBuilder = {
    select: vi.fn(() => ticketBuilder),
    eq: vi.fn(() => ticketBuilder),
    is: vi.fn(() => ticketBuilder),
    in: vi.fn(() => ticketBuilder),
    gte: vi.fn(() => ticketBuilder),
    lte: vi.fn(() => ticketBuilder),
    order: vi.fn(() => ticketBuilder),
    range: vi.fn().mockResolvedValue({
      data: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          user_id: "user-1",
          issue_id: "no-internet",
          issue_title: "No internet",
          category: "network",
          status: "Resolved",
          priority: "Normal",
          assigned_agent: "Agent",
          platform: "Windows",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T01:00:00.000Z",
          first_response_at: null,
          resolved_at: "2025-01-01T01:00:00.000Z",
          attachment_path: null,
          resolution_source: "ai",
          ai_attempted: true,
          escalated: false,
          escalation_reason: "private",
          resolution_summary: "private",
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          user_id: "user-2",
          issue_id: "email",
          issue_title: "Email unavailable",
          category: "email",
          status: "Resolved",
          priority: "Normal",
          assigned_agent: "Agent",
          platform: "Windows",
          created_at: "2025-01-01T00:00:00.000Z",
          updated_at: "2025-01-01T01:00:00.000Z",
          first_response_at: null,
          resolved_at: "2025-01-01T01:00:00.000Z",
          attachment_path: null,
          resolution_source: "employee",
          ai_attempted: false,
          escalated: false,
          escalation_reason: null,
          resolution_summary: null,
        },
      ],
      count: 2,
      error: null,
    }),
  };
  const organizationBuilder = {
    select: vi.fn(() => organizationBuilder),
    eq: vi.fn(() => organizationBuilder),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { name: "Org A" },
      error: null,
    }),
  };
  mocks.createAdminClient.mockReturnValue({
    rpc: vi.fn((name: string) =>
      Promise.resolve({
        data:
          name === "admin_resolution_metrics"
            ? {
                totalTickets: 1,
                openTickets: 0,
                aiAttempted: 1,
                aiSolved: 1,
                agentSolved: 0,
                selfServiceSolved: 0,
                escalated: 0,
                aiResolutionRate: 100,
                avgResolutionMinutes: 60,
                avgAiResolutionMinutes: 60,
                avgAgentResolutionMinutes: 0,
                daily: [
                  {
                    day: "2025-01-01",
                    aiSolved: 1,
                    agentSolved: 0,
                    escalated: 0,
                    created: 1,
                  },
                ],
              }
            : {},
        error: null,
      })
    ),
    from: vi.fn((table: string) =>
      table === "tickets" ? ticketBuilder : organizationBuilder
    ),
  });

  const result = await getOperationsData(session, {
    from: "2025-01-01T00:00:00.000Z",
    to: "2025-01-02T00:00:00.000Z",
    page: 1,
    pageSize: 25,
    resolutionSource: "ai",
  });

  expect(result.organizationName).toBe("Org A");
  expect(result.resolution?.aiSolved).toBe(1);
  expect(ticketBuilder.eq).toHaveBeenCalledWith("resolution_source", "ai");
  expect(result.tickets.rows[0]).toMatchObject({
    resolvedBy: "AI assistant",
    aiAttempted: true,
    escalated: false,
  });
  expect(result.tickets.rows[1]).toMatchObject({
    resolvedBy: "Support agent",
  });
  expect(JSON.stringify(result.tickets.rows[0])).not.toMatch(
    /escalation_reason|resolution_summary/
  );
});

test("expands the New status filter for legacy Open rows", async () => {
  vi.stubEnv("OPERATIONS_PSEUDONYM_SALT", "test-salt");
  mocks.isResolutionTrackingEnabled.mockReturnValue(false);
  const ticketBuilder = {
    select: vi.fn(() => ticketBuilder),
    eq: vi.fn(() => ticketBuilder),
    in: vi.fn(() => ticketBuilder),
    gte: vi.fn(() => ticketBuilder),
    lte: vi.fn(() => ticketBuilder),
    order: vi.fn(() => ticketBuilder),
    range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
  };
  const organizationBuilder = {
    select: vi.fn(() => organizationBuilder),
    eq: vi.fn(() => organizationBuilder),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { name: "Org A" }, error: null }),
  };
  mocks.createAdminClient.mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
    from: vi.fn((table: string) =>
      table === "tickets" ? ticketBuilder : organizationBuilder
    ),
  });

  await getOperationsData(session, {
    from: "2025-01-01T00:00:00.000Z",
    to: "2025-01-02T00:00:00.000Z",
    page: 1,
    pageSize: 25,
    status: "New",
  });

  expect(ticketBuilder.in).toHaveBeenCalledWith("status", [
    "New",
    "new",
    "Open",
    "open",
  ]);
});

test("does not freeze the default upper date bound", () => {
  const filters = defaultAdminFilters(new Date("2025-01-31T00:00:00.000Z"));
  expect(filters).not.toHaveProperty("to");
});

test("does not apply an upper date bound when one is absent", async () => {
  vi.stubEnv("OPERATIONS_PSEUDONYM_SALT", "test-salt");
  mocks.isResolutionTrackingEnabled.mockReturnValue(false);
  const ticketBuilder = {
    select: vi.fn(() => ticketBuilder),
    eq: vi.fn(() => ticketBuilder),
    is: vi.fn(() => ticketBuilder),
    in: vi.fn(() => ticketBuilder),
    gte: vi.fn(() => ticketBuilder),
    lte: vi.fn(() => ticketBuilder),
    order: vi.fn(() => ticketBuilder),
    range: vi.fn().mockResolvedValue({ data: [], count: 0, error: null }),
  };
  const organizationBuilder = {
    select: vi.fn(() => organizationBuilder),
    eq: vi.fn(() => organizationBuilder),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: { name: "Org A" }, error: null }),
  };
  mocks.createAdminClient.mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
    from: vi.fn((table: string) =>
      table === "tickets" ? ticketBuilder : organizationBuilder
    ),
  });

  await getOperationsData(session, {
    from: "2025-01-01T00:00:00.000Z",
    page: 1,
    pageSize: 25,
  });

  expect(ticketBuilder.lte).not.toHaveBeenCalled();
});
