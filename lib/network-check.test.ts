import { describe, expect, test } from "vitest";
import { getConnectionInfo, summarizeLatency } from "./network-check";

describe("summarizeLatency", () => {
  test("returns null values when every sample fails", () => {
    expect(
      summarizeLatency([
        { ok: false, ms: Number.POSITIVE_INFINITY },
        { ok: false, ms: 100 },
      ])
    ).toEqual({ avgMs: null, jitterMs: null });
  });

  test("averages valid samples and calculates jitter", () => {
    const result = summarizeLatency([
      { ok: true, ms: 10 },
      { ok: true, ms: 20 },
      { ok: true, ms: 30 },
      { ok: false, ms: 5 },
      { ok: true, ms: Number.POSITIVE_INFINITY },
    ]);

    expect(result.avgMs).toBe(20);
    expect(result.jitterMs).toBeCloseTo(Math.sqrt(200 / 3));
  });
});

describe("getConnectionInfo", () => {
  test("returns null when navigator.connection is unavailable", () => {
    expect(getConnectionInfo()).toBeNull();
  });
});
