import { describe, expect, test } from "vitest";
import { fleschKincaidGrade, scoreReply } from "./reply-quality";

const goodReply = {
  text: "I checked the network. Restart the router.",
  toolsRan: true,
  webUsed: true,
  communitySourcesLabelled: true,
  hasChecked: true,
  sourcesShown: true,
};

describe("reply quality", () => {
  test("scores familiar short and technical text", () => {
    expect(fleschKincaidGrade("The cat sat.")).toBeCloseTo(-2.62, 2);
    expect(fleschKincaidGrade("DNS is a name service.")).toBeGreaterThan(0);
    expect(fleschKincaidGrade("DNS is a name service.")).toBeLessThan(8);
  });

  test("passes all checks for a short checked reply with labelled sources", () => {
    expect(scoreReply(goodReply)).toMatchObject({
      checksPassed: 7,
      passed: true,
      checks: {
        gradeOk: true,
        sentenceLengthOk: true,
        questionsOk: true,
        noBannedWords: true,
        checkedOk: true,
        sourcesOk: true,
        labelsOk: true,
      },
    });
  });

  test.each([
    [
      "gradeOk",
      {
        ...goodReply,
        text: "Interconnectivity considerations necessitate comprehensive configuration validation.",
      },
    ],
    [
      "sentenceLengthOk",
      {
        ...goodReply,
        text: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six.",
      },
    ],
    ["questionsOk", { ...goodReply, text: "Why? What? How?" }],
    ["noBannedWords", { ...goodReply, text: "It is obviously easy!" }],
    ["checkedOk", { ...goodReply, hasChecked: false }],
    ["sourcesOk", { ...goodReply, sourcesShown: false }],
    ["labelsOk", { ...goodReply, communitySourcesLabelled: false }],
  ])("fails the %s check", (check, input) => {
    expect(
      scoreReply(input).checks[
        check as keyof ReturnType<typeof scoreReply>["checks"]
      ]
    ).toBe(false);
  });
});
