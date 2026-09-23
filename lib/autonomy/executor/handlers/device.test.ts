import { describe, expect, test } from "vitest";
import { DEVICE_ACTIONS } from "@/lib/device-agent/catalog";
import { deviceHandlers } from "./device";

describe("device capability handlers", () => {
  test("registers every catalog action without a second hard-coded list", () => {
    expect(
      deviceHandlers().map(
        (handler) => `${handler.capabilityId}:${handler.version}`
      )
    ).toEqual(DEVICE_ACTIONS.map((action) => `${action.id}:${action.version}`));
  });
});
