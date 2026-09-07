import { afterEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_ORGANIZATION_ID,
  hashInvitationToken,
  normalizeDomain,
  resolveOrganizationForUser,
} from "./membership";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

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
});
