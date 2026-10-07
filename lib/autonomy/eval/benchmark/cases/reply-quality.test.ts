import { describe, expect, test } from "vitest";
import { benchmarkCases } from ".";
import { REPLY_QUALITY_FIXTURES } from "./reply-quality-fixtures";

describe("reply-quality benchmark cases", () => {
  test("includes exactly one case for every authored fixture", () => {
    const cases = benchmarkCases.filter(
      (item) => item.suite === "requester_agent_reply_quality"
    );

    expect(cases.map((item) => item.replyQuality?.fixtureId)).toEqual(
      REPLY_QUALITY_FIXTURES.map((fixture) => fixture.id)
    );
  });
});
