import { describe, expect, it } from "vitest";
import { ratingSummary } from "./ratings-label";

describe("ratingSummary", () => {
  it("describes unrated guides", () => {
    expect(ratingSummary({ up: 0, down: 0 })).toEqual({
      buttonLabel: "Log in to rate",
      summary: "No ratings yet",
    });
  });

  it("describes helpful totals", () => {
    expect(ratingSummary({ up: 3, down: 1 }).summary).toBe(
      "3 of 4 found this helpful"
    );
  });
});
