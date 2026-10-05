import { describe, expect, test } from "vitest";
import {
  computeMbps,
  getConnectionInfo,
  summarizeLatency,
} from "./network-check";

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

describe("computeMbps", () => {
  test("converts bytes and seconds to megabits per second", () => {
    expect(computeMbps(1_250_000, 1)).toBeCloseTo(10);
    expect(computeMbps(9_000_000, 3)).toBeCloseTo(24);
  });

  test("rejects unusable input and caps instant responses", () => {
    expect(computeMbps(0, 1)).toBeNull();
    expect(computeMbps(1000, 0)).toBeNull();
    expect(computeMbps(1000, Number.NaN)).toBeNull();
    expect(computeMbps(1_000_000, 0.0001)).toBeCloseTo(400); // 20 ms floor
  });
});
