import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueNotification: vi.fn(),
}));

vi.mock("@/lib/notifications/enqueue", () => ({
  enqueueNotification: mocks.enqueueNotification,
}));

import { alertSecurityEvent } from "./alerts";

function adminFor(
  members: { user_id: string }[] | null,
  ticket: { issue_title: string } | null,
  failure = false
) {
  const query = (table: string) => {
    const chain = {
      data:
        table === "organization_members"
          ? members
          : table === "tickets"
            ? ticket
            : null,
      error: failure ? new Error("offline") : null,
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: table === "tickets" ? ticket : null,
        error: failure ? new Error("offline") : null,
      })),
      insert: vi.fn(() => chain),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: table === "organization_members" ? members : null,
          error: failure ? new Error("offline") : null,
        }).then(resolve),
    };
    return chain;
  };
  return { from: vi.fn(query) };
}

describe("autonomy security alerts", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  test("selects org admins and uses a run/kind dedupe key", async () => {
    vi.stubEnv("HELP_DESK_AUTONOMY_ALERTS_ENABLED", "true");
    const admin = adminFor([{ user_id: "admin-1" }, { user_id: "admin-2" }], {
      issue_title: "Cannot sign in",
    });
    await alertSecurityEvent(admin as never, {
      organizationId: "org-1",
      ticketId: "ticket-1",
      runId: "run-1",
      kind: "security.kill_switch",
    });
    expect(mocks.enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "security.autonomy_alert",
        recipientUserIds: ["admin-1", "admin-2"],
        dedupeKey: "autonomy:run-1:security.kill_switch",
      })
    );
  });

  test("is gated off by default", async () => {
    const admin = adminFor([{ user_id: "admin-1" }], {
      issue_title: "Ticket",
    });
    await alertSecurityEvent(admin as never, {
      organizationId: "org-1",
      ticketId: "ticket-1",
      runId: "run-1",
      kind: "security.breaker_open",
    });
    expect(mocks.enqueueNotification).not.toHaveBeenCalled();
  });

  test("records alert failures without throwing", async () => {
    vi.stubEnv("HELP_DESK_AUTONOMY_ALERTS_ENABLED", "true");
    const admin = adminFor(null, null, true);
    mocks.enqueueNotification.mockRejectedValueOnce(
      new Error("enqueue failed")
    );
    await expect(
      alertSecurityEvent(admin as never, {
        organizationId: "org-1",
        ticketId: "ticket-1",
        runId: "run-1",
        kind: "security.plan_rejected",
      })
    ).resolves.toBeUndefined();
    expect(admin.from).toHaveBeenCalledWith("resolution_events");
  });
});
