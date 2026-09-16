import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
  sealSecret: vi.fn(() => "sealed"),
  upsert: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/admin/auth", () => ({
  getAdminSession: mocks.getAdminSession,
  recordAudit: mocks.recordAudit,
}));
vi.mock("@/lib/security/secret-box", () => ({
  sealSecret: mocks.sealSecret,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: mocks.upsert,
    }),
  }),
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  createRateLimiter: () => ({ check: vi.fn(async () => ({ allowed: true })) }),
  getRateLimitConfig: () => ({}),
}));

import { saveConnectorAction } from "./admin-connectors";

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("admin connector actions", () => {
  beforeEach(() => {
    mocks.getAdminSession.mockReset();
    mocks.recordAudit.mockReset();
    mocks.upsert.mockClear();
  });

  test("denies requesters and staff", async () => {
    for (const role of ["requester", "staff"]) {
      mocks.getAdminSession.mockResolvedValue({
        role,
        organizationId: "org-1",
        userId: "user-1",
      });
      await expect(
        saveConnectorAction(
          null,
          formData({ provider: "google", allowedGroupIds: "" })
        )
      ).resolves.toEqual({ error: "Organization admin access required." });
    }
  });

  test("rejects malformed Google service-account JSON before sealing", async () => {
    mocks.getAdminSession.mockResolvedValue({
      role: "org_admin",
      organizationId: "org-1",
      userId: "user-1",
    });
    const result = await saveConnectorAction(
      null,
      formData({
        provider: "google",
        serviceAccountJson: JSON.stringify({ client_email: "x@example.com" }),
        adminSubject: "admin@example.com",
        allowedGroupIds: "",
      })
    );
    expect(result).toEqual({
      error: "Google service account JSON is invalid.",
    });
    expect(mocks.sealSecret).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
