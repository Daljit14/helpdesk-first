import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registryEnabled: vi.fn(),
  readKillSwitches: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isCapabilityRegistryEnabled: mocks.registryEnabled,
}));
vi.mock("../kill-switches", () => ({
  readKillSwitches: mocks.readKillSwitches,
}));

import { isCapabilityEnabled } from "./enablement";

const organizationId = "org-1";
const capabilityId = "route_to_department";

function makeAdmin(options: {
  organization?: { min_version: number; enabled: boolean } | null;
  version?: { status: string } | null;
  organizationError?: Error | null;
  versionError?: Error | null;
}) {
  const organizationQuery = {
    select: vi.fn(() => organizationQuery),
    eq: vi.fn(() => organizationQuery),
    maybeSingle: vi.fn(async () => ({
      data: options.organization ?? null,
      error: options.organizationError ?? null,
    })),
  };
  const versionQuery = {
    select: vi.fn(() => versionQuery),
    eq: vi.fn(() => versionQuery),
    maybeSingle: vi.fn(async () => ({
      data: options.version ?? null,
      error: options.versionError ?? null,
    })),
  };
  return {
    from: vi.fn((table: string) =>
      table === "organization_capabilities" ? organizationQuery : versionQuery
    ),
    organizationQuery,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("capability enablement", () => {
  function configure() {
    mocks.registryEnabled.mockReturnValue(true);
    mocks.readKillSwitches.mockResolvedValue({
      global: false,
      organization: false,
      capability: false,
      anyActive: false,
      reasons: [],
    });
    vi.stubEnv("HELP_DESK_CAP_ROUTE_TO_DEPARTMENT_ENABLED", "true");
  }

  test.each([
    ["registry flag off", () => mocks.registryEnabled.mockReturnValue(false)],
    [
      "per-capability env flag off",
      () => vi.stubEnv("HELP_DESK_CAP_ROUTE_TO_DEPARTMENT_ENABLED", "false"),
    ],
    ["unknown capability", () => undefined],
    ["organization row missing", () => undefined],
    ["organization row disabled", () => undefined],
    ["minimum version too high", () => undefined],
    ["deprecated version", () => undefined],
    ["kill switch active", () => undefined],
    ["database error", () => undefined],
  ])("%s fails closed", async (name, setup) => {
    configure();
    const adminOptions: Parameters<typeof makeAdmin>[0] = {
      organization: { min_version: 1, enabled: true },
      version: { status: "active" },
    };
    let id = capabilityId;
    if (name === "unknown capability") id = "nope";
    if (name === "organization row missing") adminOptions.organization = null;
    if (name === "organization row disabled")
      adminOptions.organization = { min_version: 1, enabled: false };
    if (name === "minimum version too high")
      adminOptions.organization = { min_version: 2, enabled: true };
    if (name === "deprecated version")
      adminOptions.version = { status: "deprecated" };
    if (name === "kill switch active") {
      mocks.readKillSwitches.mockResolvedValue({
        global: false,
        organization: false,
        capability: true,
        anyActive: true,
        reasons: ["disabled"],
      });
    }
    if (name === "database error")
      adminOptions.organizationError = new Error("database unavailable");
    setup();
    const admin = makeAdmin(adminOptions);
    await expect(
      isCapabilityEnabled(admin as never, {
        organizationId,
        id,
        version: 1,
      })
    ).resolves.toBe(false);
  });

  test("requires organization scoping and enables a fully approved capability", async () => {
    configure();
    const admin = makeAdmin({
      organization: { min_version: 1, enabled: true },
      version: { status: "active" },
    });
    await expect(
      isCapabilityEnabled(admin as never, {
        organizationId,
        id: capabilityId,
        version: 1,
      })
    ).resolves.toBe(true);
    expect(admin.organizationQuery.eq).toHaveBeenCalledWith(
      "organization_id",
      organizationId
    );
  });
});
