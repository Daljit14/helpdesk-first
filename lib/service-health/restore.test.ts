import { beforeEach, describe, expect, test, vi } from "vitest";
import { notifyRestoredOutages } from "./restore";

const mocks = vi.hoisted(() => ({
  getServiceHealth: vi.fn(),
  enqueueNotification: vi.fn(),
}));

vi.mock("./index", () => ({ getServiceHealth: mocks.getServiceHealth }));
vi.mock("@/lib/notifications/enqueue", () => ({
  enqueueNotification: mocks.enqueueNotification,
}));

function makeAdmin(
  subscriptions: Record<string, unknown>[],
  options: { listError?: { message: string } | null } = {}
) {
  const listQuery: Record<string, (...args: unknown[]) => unknown> = {};
  const select = vi.fn(() => listQuery);
  const eq = vi.fn(() => listQuery);
  const order = vi.fn(() => listQuery);
  const limit = vi.fn(async () => ({
    data: subscriptions,
    error: options.listError ?? null,
  }));
  Object.assign(listQuery, { select, eq, order, limit });

  const updateQuery: Record<string, unknown> = { error: null };
  const update = vi.fn(() => updateQuery);
  const mutationEq = vi.fn(() => updateQuery);
  Object.assign(updateQuery, { eq: mutationEq });
  const from = vi.fn((table: string) =>
    table === "outage_subscriptions"
      ? {
          select,
          eq,
          order,
          limit,
          update,
        }
      : {}
  );
  return { from, select, eq, order, limit, update, mutationEq };
}

const subscriptions = [
  {
    id: "sub-1",
    organization_id: "org-1",
    user_id: "user-1",
    source: "microsoft365",
    incident_id: "EX123",
    service: "Exchange Online",
  },
  {
    id: "sub-2",
    organization_id: "org-1",
    user_id: "user-2",
    source: "google_workspace",
    incident_id: "G-456",
    service: "Gmail",
  },
  {
    id: "sub-3",
    organization_id: "org-1",
    user_id: "user-3",
    source: "statuspage",
    incident_id: "sp-789",
    service: "Company Status",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enqueueNotification.mockResolvedValue(undefined);
  mocks.getServiceHealth.mockResolvedValue({
    sources: [
      { source: "microsoft365", name: "Microsoft 365", ok: false },
      { source: "google_workspace", name: "Google Workspace", ok: true },
      { source: "statuspage", name: "Company Status", ok: true },
    ],
    incidents: [
      {
        source: "google_workspace",
        incidentId: "G-456",
        service: "Gmail",
        title: "Gmail is experiencing delays",
        impact: "degraded",
        startedAt: null,
        url: "https://www.google.com/appsstatus/dashboard/",
      },
    ],
    checkedAt: "2026-09-01T00:00:00.000Z",
  });
});

describe("notifyRestoredOutages", () => {
  test("uses a fresh bounded snapshot and only notifies recovered incidents", async () => {
    const admin = makeAdmin(subscriptions);

    await expect(notifyRestoredOutages(admin as never)).resolves.toEqual({
      checked: 3,
      notified: 1,
    });

    expect(admin.limit).toHaveBeenCalledWith(500);
    expect(mocks.getServiceHealth).toHaveBeenCalledOnce();
    expect(mocks.getServiceHealth).toHaveBeenCalledWith(
      admin,
      "org-1",
      expect.any(AbortSignal),
      { fresh: true }
    );
    expect(mocks.enqueueNotification).toHaveBeenCalledOnce();
    expect(mocks.enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        ticketId: null,
        eventType: "service.restored",
        recipientUserIds: ["user-3"],
        subject: "✅ Company Status is back",
        body: "Company Status is back to normal. The service incident has cleared.",
        url: "/assistant",
        dedupeKey: "outage:sub-3",
      })
    );
    expect(admin.update).toHaveBeenCalledWith({
      status: "notified",
      notified_at: expect.any(String),
    });
    expect(admin.mutationEq).toHaveBeenNthCalledWith(1, "id", "sub-3");
    expect(admin.mutationEq).toHaveBeenNthCalledWith(2, "status", "active");
  });

  test("checks snapshots independently for each organization", async () => {
    const rows = [
      { ...subscriptions[0], organization_id: "org-1" },
      { ...subscriptions[1], organization_id: "org-2" },
    ];
    const admin = makeAdmin(rows);
    mocks.getServiceHealth
      .mockResolvedValueOnce({
        sources: [{ source: "microsoft365", name: "Microsoft 365", ok: true }],
        incidents: [],
      })
      .mockResolvedValueOnce({
        sources: [
          { source: "google_workspace", name: "Google Workspace", ok: true },
        ],
        incidents: [],
      });

    await notifyRestoredOutages(admin as never);

    expect(mocks.getServiceHealth).toHaveBeenCalledTimes(2);
    expect(mocks.getServiceHealth.mock.calls.map((call) => call[1])).toEqual([
      "org-1",
      "org-2",
    ]);
    expect(mocks.enqueueNotification).toHaveBeenCalledTimes(2);
  });

  test("fails the run when the active-subscription query fails", async () => {
    const admin = makeAdmin([], { listError: { message: "database error" } });
    await expect(notifyRestoredOutages(admin as never)).rejects.toEqual({
      message: "database error",
    });
    expect(mocks.getServiceHealth).not.toHaveBeenCalled();
  });
});
