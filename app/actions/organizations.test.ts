import { afterEach, describe, expect, test, vi } from "vitest";
import {
  domainSchema,
  invitationSchema,
  organizationSchema,
  roleSchema,
} from "@/lib/org/schemas";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/auth", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/admin/auth")>(
      "@/lib/admin/auth"
    );
  return {
    ...actual,
    getAdminSession: mocks.getAdminSession,
    recordAudit: vi.fn(),
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { inviteMember } from "./organizations";

afterEach(() => {
  vi.clearAllMocks();
});

describe("organization action schemas", () => {
  test("accepts organization and invitation inputs", () => {
    expect(
      organizationSchema.safeParse({ name: "Example School" }).success
    ).toBe(true);
    expect(
      invitationSchema.safeParse({
        email: "person@example.com",
        role: "support_agent",
      }).success
    ).toBe(true);
    expect(roleSchema.safeParse("org_admin").success).toBe(true);
  });

  test("rejects invalid domains", () => {
    expect(domainSchema.safeParse({ domain: "" }).success).toBe(false);
  });
});

describe("inviteMember", () => {
  test("rejects duplicate invitations when multiple pending rows exist", async () => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      gt: vi.fn(async () => ({ count: 2, error: null })),
    };
    mocks.getAdminSession.mockResolvedValue({
      userId: "admin-1",
      email: "admin@example.com",
      role: "org_admin",
      isPlatformAdmin: false,
      organizationId: "org-1",
      displayName: "Admin",
    });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => builder),
    });

    await expect(
      inviteMember({ email: "person@example.com", role: "requester" })
    ).resolves.toEqual({
      error: "An invite for this email is already pending.",
    });
    expect(builder.select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
  });
});
