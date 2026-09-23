import { describe, expect, it } from "vitest";
import {
  DEVICE_CATALOG_VERSION,
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
    expect(DEVICE_CATALOG_VERSION).toBe("2026-09-21.3");
    expect(
      getDeviceAction("device_cleanup_temp_files", 1)?.snapshotSpec
    ).toEqual(["temp_inventory"]);
    expect(
      DEVICE_ACTIONS.filter(
        (action) => action.sideEffects === "local_write"
      ).every((action) => !/later phase/i.test(action.description))
    ).toBe(true);
  });
});
