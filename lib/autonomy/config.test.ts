import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  getBlastRadiusLimits,
  getHourlyExecutionLimits,
  isBlastRadiusEnabled,
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

  test("uses blast-radius defaults only when enabled", () => {
    expect(isBlastRadiusEnabled()).toBe(false);
    expect(getHourlyExecutionLimits()).toEqual({
      orgHourly: null,
      capabilityDevicesPerHour: null,
    });
    vi.stubEnv("HELP_DESK_BLAST_RADIUS_ENABLED", "true");
    expect(isBlastRadiusEnabled()).toBe(true);
    expect(getHourlyExecutionLimits()).toEqual({
      orgHourly: 20,
      capabilityDevicesPerHour: 10,
    });
  });

  test("keeps explicitly configured hourly limits active when the trip flag is off", () => {
    vi.stubEnv("HELP_DESK_AUTONOMY_ORG_HOURLY_EXECUTION_LIMIT", "7.8");
    vi.stubEnv("HELP_DESK_AUTONOMY_CAPABILITY_DEVICES_PER_HOUR", "0");
    expect(getHourlyExecutionLimits()).toEqual({
      orgHourly: 8,
      capabilityDevicesPerHour: 1,
    });
  });

  test("bounds blast-radius thresholds and accepts valid failure rates", () => {
    vi.stubEnv("HELP_DESK_BLAST_RADIUS_FAILURES", "0");
    vi.stubEnv("HELP_DESK_BLAST_RADIUS_FAILURE_RATE", "0.45");
    vi.stubEnv("HELP_DESK_BLAST_RADIUS_WINDOW_MINUTES", "2000");
    expect(getBlastRadiusLimits()).toEqual({
      failures: 1,
      failureRate: 0.45,
      minRuns: 5,
      windowMs: 1_440 * 60_000,
    });
    vi.stubEnv("HELP_DESK_BLAST_RADIUS_FAILURE_RATE", "0");
    expect(getBlastRadiusLimits().failureRate).toBe(0.3);
    vi.stubEnv("HELP_DESK_BLAST_RADIUS_FAILURE_RATE", "0.42trailing");
    expect(getBlastRadiusLimits().failureRate).toBe(0.42);
    vi.stubEnv("HELP_DESK_BLAST_RADIUS_FAILURE_RATE", "1.01");
    expect(getBlastRadiusLimits().failureRate).toBe(0.3);
  });
});
