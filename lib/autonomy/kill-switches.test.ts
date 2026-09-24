import { afterEach, describe, expect, test, vi } from "vitest";
import { readKillSwitches, setKillSwitch } from "./kill-switches";

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
      envDisabled: true,
      explicit: false,
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
      envDisabled: false,
      explicit: true,
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
      envDisabled: false,
      explicit: true,
      reasons: ["switch_read_failed"],
    });
  });

  test("capability environment override is reported as active", async () => {
    vi.stubEnv("HELP_DESK_AUTONOMY_ENABLED", "true");
    vi.stubEnv("HELP_DESK_CAP_RESET_ENABLED", "false");
    const admin = adminWith({ data: [], error: null });
    await expect(
      readKillSwitches(admin as never, "org-1", "reset")
    ).resolves.toMatchObject({
      capability: true,
      envDisabled: false,
      explicit: true,
      reasons: ["capability_env_disabled"],
    });
  });

  test("setKillSwitch selects then updates expression-indexed scope rows", async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: { id: "switch-1" },
        error: null,
      })),
      update: vi.fn(() => query),
      insert: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    const admin = { from: vi.fn(() => query) };
    await expect(
      setKillSwitch(admin as never, {
        scope: "organization",
        scopeId: "org-1",
        organizationId: "org-1",
        enabled: false,
        reason: "maintenance",
        setBy: "staff:1",
      })
    ).resolves.toEqual({ ok: true });
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, organization_id: "org-1" })
    );
  });
});
