import { afterEach, describe, expect, test, vi } from "vitest";
import { enqueueNotification } from "./enqueue";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("./dispatch", () => ({ dispatchPending: vi.fn() }));
vi.mock("@/lib/admin/flags", () => ({ isNotificationsEnabled: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe("enqueueNotification", () => {
  const makeBuilder = (data: unknown = []) => ({
    select: vi.fn(() => makeBuilder(data)),
    eq: vi.fn(() => makeBuilder(data)),
    in: vi.fn(() => Promise.resolve({ data, error: null })),
    upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
  });

  test("returns early when notifications are disabled", async () => {
    const { isNotificationsEnabled } = await import("@/lib/admin/flags");
    vi.mocked(isNotificationsEnabled).mockReturnValue(false);
    await enqueueNotification({
      organizationId: "org-1",
      ticketId: "t1",
      eventType: "ticket.created",
      recipientUserIds: ["u1"],
      subject: "s",
      body: "b",
      dedupeKey: "d",
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  test("writes outbox rows and dispatches", async () => {
    const { isNotificationsEnabled } = await import("@/lib/admin/flags");
    const { dispatchPending } = await import("./dispatch");
    vi.mocked(isNotificationsEnabled).mockReturnValue(true);
    const builder = makeBuilder([
      { user_id: "u1", email_enabled: true, push_enabled: true },
    ]);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => builder),
    } as never);
    await enqueueNotification({
      organizationId: "org-1",
      ticketId: "t1",
      eventType: "ticket.created",
      recipientUserIds: ["u1"],
      subject: "s",
      body: "b",
      url: "http://example.com",
      dedupeKey: "d",
    });
    expect(builder.upsert).toHaveBeenCalledOnce();
    expect(builder.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          dedupe_key: "d:u1:email",
          channel: "email",
        }),
        expect.objectContaining({
          dedupe_key: "d:u1:push",
          channel: "push",
        }),
      ],
      { onConflict: "dedupe_key", ignoreDuplicates: true }
    );
    expect(dispatchPending).toHaveBeenCalledWith({ ticketId: "t1" });
  });

  test("respects disabled channels", async () => {
    const { isNotificationsEnabled } = await import("@/lib/admin/flags");
    vi.mocked(isNotificationsEnabled).mockReturnValue(true);
    const builder = makeBuilder([
      { user_id: "u1", email_enabled: false, push_enabled: true },
    ]);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => builder),
    } as never);
    await enqueueNotification({
      organizationId: "org-1",
      ticketId: "t1",
      eventType: "ticket.created",
      recipientUserIds: ["u1"],
      subject: "s",
      body: "b",
      dedupeKey: "d",
    });
    expect(builder.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ dedupe_key: "d:u1:push", channel: "push" })],
      { onConflict: "dedupe_key", ignoreDuplicates: true }
    );
  });
});
