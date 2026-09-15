import { describe, expect, test } from "vitest";
import { sanitizeOutput } from "./sanitize";

describe("sanitizeOutput", () => {
  test("keeps scalar values and strips control characters", () => {
    expect(
      sanitizeOutput({
        text: "  hello\u0000 world  ",
        count: 2,
        enabled: true,
        empty: null,
        nested: { secret: true },
        list: [1, 2],
      })
    ).toEqual({
      text: "hello world",
      count: 2,
      enabled: true,
      empty: null,
    });
  });

  test("trims strings to 200 characters", () => {
    expect(sanitizeOutput({ value: "x".repeat(250) }).value).toHaveLength(200);
  });
});
