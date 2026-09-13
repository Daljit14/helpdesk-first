import { afterEach, describe, expect, it } from "vitest";
import { isUiV2Enabled } from "./ui-v2";

describe("isUiV2Enabled", () => {
  const original = process.env.NEXT_PUBLIC_UI_V2_ENABLED;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_UI_V2_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_UI_V2_ENABLED = original;
    }
  });

  it("is off unless the public flag is exactly true", () => {
    delete process.env.NEXT_PUBLIC_UI_V2_ENABLED;
    expect(isUiV2Enabled()).toBe(false);
    process.env.NEXT_PUBLIC_UI_V2_ENABLED = "TRUE";
    expect(isUiV2Enabled()).toBe(false);
  });

  it("is on when the public flag is true", () => {
    process.env.NEXT_PUBLIC_UI_V2_ENABLED = "true";
    expect(isUiV2Enabled()).toBe(true);
  });
});
