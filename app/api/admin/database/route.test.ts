import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";
import { requireAdminApi } from "@/lib/admin/auth";

vi.mock("@/lib/admin/auth", () => ({
  requireAdminApi: vi.fn(),
}));

vi.mock("@/lib/admin/database-overview", () => ({
  loadDbOverview: vi.fn(),
  loadLiveEvents: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe("admin database route", () => {
  test("returns auth responses unchanged", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue(
      Response.json({ error: "Unauthorized." }, { status: 401 })
    );
    expect(
      (await GET(new Request("http://localhost/api/admin/database"))).status
    ).toBe(401);
  });

  test("rejects an invalid since timestamp", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({
      userId: "user-1",
      email: "admin@example.com",
      role: "support_agent",
      organizationId: "org-1",
      displayName: "Admin",
      isPlatformAdmin: false,
    });
    const response = await GET(
      new Request("http://localhost/api/admin/database?since=not-a-date")
    );
    expect(response.status).toBe(400);
  });
});
