import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  createAdminClient: vi.fn(),
  reviewPilotResolution: vi.fn(),
  resumePilot: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/autonomy/pilot-review", () => ({
  reviewPilotResolution: mocks.reviewPilotResolution,
  resumePilot: mocks.resumePilot,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { resumePilotAction, reviewPilotResolutionAction } from "./admin-pilot";

const orgAdmin = {
  userId: "user-1",
  email: "admin@example.com",
  role: "org_admin" as const,
  organizationId: "org-1",
  displayName: "Admin",
  isPlatformAdmin: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminSession.mockResolvedValue(orgAdmin);
  mocks.createAdminClient.mockReturnValue({});
  mocks.reviewPilotResolution.mockResolvedValue({ ok: true });
  mocks.resumePilot.mockResolvedValue({ ok: true });
});

describe("pilot admin actions", () => {
  test("rejects support agents for both actions", async () => {
    mocks.getAdminSession.mockResolvedValue({
      ...orgAdmin,
      role: "support_agent",
    });
    await expect(resumePilotAction()).resolves.toEqual({
      error: "Organization admin access required.",
    });
    await expect(
      reviewPilotResolutionAction({
        id: "00000000-0000-4000-8000-000000000001",
        status: "confirmed",
        note: "",
      })
    ).resolves.toEqual({ error: "Organization admin access required." });
  });

  test("rejects invalid review input", async () => {
    await expect(
      reviewPilotResolutionAction({
        id: "not-a-uuid",
        status: "confirmed",
        note: "",
      })
    ).resolves.toEqual({ error: "Invalid pilot review." });
  });

  test("revalidates after successful review and resume actions", async () => {
    await expect(
      reviewPilotResolutionAction({
        id: "00000000-0000-4000-8000-000000000001",
        status: "unsafe",
        note: "Needs pause",
      })
    ).resolves.toEqual({ success: true });
    await expect(resumePilotAction()).resolves.toEqual({ success: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/admin/resolution/pilot"
    );
    expect(mocks.reviewPilotResolution).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        organizationId: "org-1",
        reviewerId: "user-1",
      })
    );
    expect(mocks.resumePilot).toHaveBeenCalledWith({}, "org-1", "user-1");
  });
});
