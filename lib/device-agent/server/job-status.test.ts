import { describe, expect, test } from "vitest";
import { isRealDeviceJob } from "./job-status";

describe("isRealDeviceJob", () => {
  test("hides cancelled and expired jobs", () => {
    expect(isRealDeviceJob({ status: "cancelled" })).toBe(false);
    expect(isRealDeviceJob({ status: "expired" })).toBe(false);
  });

  test("keeps active, terminal-result, and shadow statuses", () => {
    for (const status of [
      "queued",
      "leased",
      "succeeded",
      "failed",
      "shadowed",
      "unsupported",
      "shadow",
    ])
      expect(isRealDeviceJob({ status })).toBe(true);
  });
});
