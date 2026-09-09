import { afterEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_ORGANIZATION_ID,
  ensureRequesterMembership,
  hashInvitationToken,
  normalizeDomain,
  resolveOrganizationForUser,
} from "./membership";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueNotification } from "@/lib/notifications/enqueue";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/notifications/enqueue", () => ({
  enqueueNotification: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("organization membership helpers", () => {
  test("hashes invitation tokens with SHA-256", () => {
    expect(hashInvitationToken("token")).toBe(
      "3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0"
    );
  });

  test("normalizes domains", () => {
    expect(normalizeDomain(" HTTPS://Example.COM/path/ ")).toBe("example.com");
  });

  test("falls back to the seeded organization", async () => {
    const builder = {
      from: vi.fn(() => builder),
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    vi.mocked(createAdminClient).mockReturnValue(builder as never);
    await expect(resolveOrganizationForUser("user-1")).resolves.toEqual({
      organizationId: DEFAULT_ORGANIZATION_ID,
      role: "requester",
    });
  });

  test("enqueues a welcome email when a new requester is provisioned", async () => {
    const insert = vi.fn(async () => ({ data: null, error: null }));
    const builder = {
      from: vi.fn(() => builder),
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      insert,
    };
    vi.mocked(createAdminClient).mockReturnValue(builder as never);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await ensureRequesterMembership(
      { id: "user-1", email: "user@example.com" } as never,
      { rpc } as never
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", role: "requester" })
    );
    expect(enqueueNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "account.created",
        recipientUserIds: ["user-1"],
        dedupeKey: "account.created:user-1",
      })
    );
  });

  test("does not enqueue a welcome email for an existing member", async () => {
    const builder = {
      from: vi.fn(() => builder),
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({
        data: { organization_id: DEFAULT_ORGANIZATION_ID },
        error: null,
      })),
      insert: vi.fn(),
    };
    vi.mocked(createAdminClient).mockReturnValue(builder as never);
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    await ensureRequesterMembership(
      { id: "user-1", email: "user@example.com" } as never,
      { rpc } as never
    );

    expect(builder.insert).not.toHaveBeenCalled();
    expect(enqueueNotification).not.toHaveBeenCalled();
  });
});
