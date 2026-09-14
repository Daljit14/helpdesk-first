import { describe, expect, test } from "vitest";
import { buildIdempotencyKey, canonicalize } from "./idempotency";

const base = {
  runId: "run-1",
  stepId: "step-1",
  capabilityId: "read_ticket",
  capabilityVersion: 1,
  parameters: {
    nested: { z: 2, a: 1 },
    list: [{ b: true, a: "x" }],
  },
};

describe("autonomy idempotency", () => {
  test("canonicalizes nested object key order", () => {
    expect(buildIdempotencyKey(base)).toBe(
      buildIdempotencyKey({
        ...base,
        parameters: {
          list: [{ a: "x", b: true }],
          nested: { a: 1, z: 2 },
        },
      })
    );
    expect(canonicalize({ z: 1, a: { y: 2, x: 3 } })).toEqual({
      a: { x: 3, y: 2 },
      z: 1,
    });
  });

  test("changes when version or parameters change", () => {
    expect(buildIdempotencyKey({ ...base, capabilityVersion: 2 })).not.toBe(
      buildIdempotencyKey(base)
    );
    expect(
      buildIdempotencyKey({
        ...base,
        parameters: { ...base.parameters, extra: "changed" },
      })
    ).not.toBe(buildIdempotencyKey(base));
  });
});
