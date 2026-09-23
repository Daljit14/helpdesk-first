import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  getAdminSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/admin/auth", () => ({
  getAdminSession: mocks.getAdminSession,
  recordAudit: vi.fn(),
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  createRateLimiter: () => ({ check: mocks.check }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/device-agent/server/consent-policies", () => ({
  upsertConsentPolicy: vi.fn(),
}));
vi.mock("@/lib/device-agent/server/enroll", () => ({
  createEnrollmentToken: vi.fn(),
}));

import {
  createEnrollmentTokenAction,
  reviewDeviceShadowAction,
  revokeDeviceAction,
  revokeEnrollmentTokenAction,
  upsertDeviceConsentPolicyAction,
} from "./admin-devices";

describe("admin device action rate limiting", () => {
  beforeEach(() => {
    mocks.getAdminSession.mockResolvedValue({
      role: "org_admin",
      organizationId: "org-1",
      userId: "user-1",
    });
    mocks.check.mockResolvedValue({ allowed: false });
  });

  test("returns a distinct rate-limit error for every device action", async () => {
    const actions = [
      () => createEnrollmentTokenAction({}),
      () => revokeEnrollmentTokenAction(null),
      () => revokeDeviceAction(null),
      () => reviewDeviceShadowAction(null),
      () => upsertDeviceConsentPolicyAction(null),
    ];

    for (const action of actions) {
      await expect(action()).resolves.toEqual({
        error: "Too many changes. Try again in a minute.",
      });
    }
  });

  test("keeps authorization errors distinct from rate limits", async () => {
    mocks.check.mockResolvedValue({ allowed: true });
    mocks.getAdminSession.mockResolvedValue(null);

    await expect(upsertDeviceConsentPolicyAction(null)).resolves.toEqual({
      error: "Not authorized.",
    });
  });
});
