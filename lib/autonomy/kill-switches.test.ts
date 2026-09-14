import { afterEach, describe, expect, test, vi } from "vitest";
import { readKillSwitches } from "./kill-switches";

const { from } = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

function adminWith(result: { data?: unknown; error?: unknown }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(async () => result),
  };
  from.mockReturnValue(query);
  return { from };
}

describe("autonomy kill switches", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  test("disabled autonomy is a global switch", async () => {
    vi.stubEnv("HELP_DESK_AUTONOMY_ENABLED", "false");
    const admin = adminWith({ data: [], error: null });
    const result = await readKillSwitches(admin as never, "org-1");
    expect(result).toMatchObject({
      global: true,
      anyActive: true,
      reasons: ["autonomy_disabled"],
    });
  });

  test("organization and capability rows are returned", async () => {
    vi.stubEnv("HELP_DESK_AUTONOMY_ENABLED", "true");
    const admin = adminWith({
      data: [
        { scope: "organization", scope_id: "org-1", reason: "maintenance" },
        { scope: "capability", scope_id: "reset", reason: "unsafe" },
      ],
      error: null,
    });
    const result = await readKillSwitches(admin as never, "org-1", "reset");
    expect(result).toMatchObject({
      organization: true,
      capability: true,
      anyActive: true,
      reasons: ["maintenance", "unsafe"],
    });
  });

  test("read errors fail closed", async () => {
    vi.stubEnv("HELP_DESK_AUTONOMY_ENABLED", "true");
    const admin = adminWith({ data: null, error: new Error("offline") });
    const result = await readKillSwitches(admin as never, "org-1");
    expect(result).toMatchObject({
      global: true,
      anyActive: true,
      reasons: ["switch_read_failed"],
    });
  });
});
