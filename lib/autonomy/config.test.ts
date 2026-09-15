import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  getPilotCapabilityAllowlist,
  getPilotLimits,
  getPilotOrgAllowlist,
} from "./config";

describe("pilot configuration", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  test("trims and deduplicates organization IDs", () => {
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_ALLOWLIST", " org-1,org-2, org-1,, ");
    expect(getPilotOrgAllowlist()).toEqual(["org-1", "org-2"]);
  });

  test("distinguishes an unset capability list from an empty configured list", () => {
    expect(getPilotCapabilityAllowlist()).toBeNull();
    vi.stubEnv("HELP_DESK_PILOT_CAPABILITY_ALLOWLIST", " , ");
    expect(getPilotCapabilityAllowlist()).toEqual([]);
  });

  test("uses bounded defaults and limits", () => {
    expect(getPilotLimits()).toEqual({ globalDaily: 20, orgDaily: 10 });
    vi.stubEnv("HELP_DESK_AUTONOMY_DAILY_EXECUTION_LIMIT", "0");
    vi.stubEnv("HELP_DESK_PILOT_ORG_DAILY_EXECUTION_LIMIT", "20000");
    expect(getPilotLimits()).toEqual({
      globalDaily: 1,
      orgDaily: 10_000,
    });
  });
});
