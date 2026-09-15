import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { reviewShadowDecision } from "./admin-shadow";

const orgAdmin = {
  userId: "user-1",
  email: "admin@example.com",
  role: "org_admin" as const,
  organizationId: "org-1",
  displayName: "Admin",
  isPlatformAdmin: false,
};

function makeAdmin(
  result: {
    data: Record<string, unknown> | null;
    error: null | { message: string };
  } = {
    data: { id: "shadow-1", run_id: "run-1", ticket_id: "ticket-1" },
    error: null,
  }
) {
  const query = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    insert: vi.fn(async () => ({ data: null, error: null })),
  };
  return { from: vi.fn(() => query), query };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminSession.mockResolvedValue(orgAdmin);
  mocks.createAdminClient.mockReturnValue(makeAdmin());
});

describe("reviewShadowDecision", () => {
  test("rejects support agents", async () => {
    mocks.getAdminSession.mockResolvedValue({
      ...orgAdmin,
      role: "support_agent",
    });
    await expect(
      reviewShadowDecision({
        id: "00000000-0000-4000-8000-000000000001",
        status: "agree",
        note: "",
      })
    ).resolves.toEqual({ error: "Organization admin access required." });
  });

  test("scopes organization admin updates", async () => {
    const client = makeAdmin();
    mocks.createAdminClient.mockReturnValue(client);
    await reviewShadowDecision({
      id: "00000000-0000-4000-8000-000000000001",
      status: "agree",
      note: "Looks safe",
    });
    expect(client.query.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  test("returns not found when the scoped row is absent", async () => {
    mocks.createAdminClient.mockReturnValue(
      makeAdmin({ data: null, error: null })
    );
    await expect(
      reviewShadowDecision({
        id: "00000000-0000-4000-8000-000000000001",
        status: "agree",
        note: "",
      })
    ).resolves.toEqual({ error: "Shadow decision not found." });
  });

  test("writes the reviewed event after a successful update", async () => {
    const client = makeAdmin();
    mocks.createAdminClient.mockReturnValue(client);
    await expect(
      reviewShadowDecision({
        id: "00000000-0000-4000-8000-000000000001",
        status: "disagree",
        note: "Needs review",
      })
    ).resolves.toEqual({ success: true });
    expect(client.from).toHaveBeenCalledWith("resolution_events");
  });
});
