import { describe, expect, it } from "vitest";
import {
  DEVICE_ACTIONS,
  getDeviceAction,
  validateDeviceCatalog,
} from "./catalog";

describe("device-agent catalog", () => {
  it("is valid and excludes malware quarantine", () => {
    expect(validateDeviceCatalog(DEVICE_ACTIONS)).toEqual([]);
    expect(
      DEVICE_ACTIONS.some((action) => action.id.includes("quarantine"))
    ).toBe(false);
    expect(getDeviceAction("device_flush_dns", 1)?.sideEffects).toBe(
      "local_write"
    );
  });
});
