import { describe, expect, it } from "vitest";
import { resolveStepText } from "./step-text";

describe("resolveStepText", () => {
  it("resolves valid and invalid references", () => {
    expect(
      resolveStepText({ guideSlug: "lost-stolen-device", stepIndex: 0 })
    ).toMatchObject({ text: expect.stringContaining("Report the loss") });
    expect(
      resolveStepText({ guideSlug: "lost-stolen-device", stepIndex: 99 })
    ).toBeNull();
    expect(resolveStepText({ guideSlug: "not-real", stepIndex: 0 })).toBeNull();
  });
});
