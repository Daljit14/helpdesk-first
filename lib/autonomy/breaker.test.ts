import { describe, expect, test } from "vitest";
import { evaluateBreaker } from "./breaker";

describe("autonomy circuit breaker", () => {
  test("opens at the threshold inside the window", () => {
    expect(
      evaluateBreaker([80, 90, 100], 100, { threshold: 3, windowMs: 20 })
    ).toEqual({ open: true, failuresInWindow: 3 });
  });

  test("does not count failures outside the window", () => {
    expect(
      evaluateBreaker([79, 80, 90], 100, { threshold: 3, windowMs: 20 })
    ).toEqual({ open: false, failuresInWindow: 2 });
  });

  test("does not count future timestamps", () => {
    expect(
      evaluateBreaker([100, 101], 100, { threshold: 2, windowMs: 20 })
    ).toEqual({ open: false, failuresInWindow: 1 });
  });
});
