import { afterEach, describe, expect, test, vi } from "vitest";
import { isOrgEnvironmentEnabled } from "@/lib/admin/flags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isOrgEnvironmentEnabled", () => {
  test("requires the exact true value", () => {
    vi.stubEnv("HELP_DESK_ORG_ENVIRONMENT_ENABLED", "true");
    expect(isOrgEnvironmentEnabled()).toBe(true);
    vi.stubEnv("HELP_DESK_ORG_ENVIRONMENT_ENABLED", "TRUE");
    expect(isOrgEnvironmentEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_ORG_ENVIRONMENT_ENABLED", "1");
    expect(isOrgEnvironmentEnabled()).toBe(false);
    vi.stubEnv("HELP_DESK_ORG_ENVIRONMENT_ENABLED", "false");
    expect(isOrgEnvironmentEnabled()).toBe(false);
  });
});
