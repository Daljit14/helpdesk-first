import { afterEach, describe, expect, test, vi } from "vitest";
import {
  evaluateBreaker,
  readBreakerState,
  recordBreakerOutcome,
} from "./breaker";

function adminFor(row: Record<string, unknown> | null, error: unknown = null) {
  const queries: Record<string, ReturnType<typeof queryFor>> = {};
  function queryFor() {
    const query = {
      data: row,
      error,
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      update: vi.fn(() => query),
      insert: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: row, error })),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  }
  return {
    from: vi.fn((table: string) => {
      queries[table] ??= queryFor();
      return queries[table];
    }),
    queries,
  };
}

describe("autonomy circuit breaker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
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

  test("moves open state to half-open after cooldown", async () => {
    const admin = adminFor({
      state: "open",
      failures: 3,
      cooldown_until: "2025-01-01T00:00:00.000Z",
    });
    const result = await readBreakerState(
      admin as never,
      "org-1",
      "cap-1",
      new Date("2025-01-02T00:00:00.000Z")
    );
    expect(result).toMatchObject({ state: "half_open", open: false });
    expect(admin.queries.capability_breakers.update).toHaveBeenCalled();
  });

  test("half-open success closes and resets failures", async () => {
    const admin = adminFor({ state: "half_open", failures: 3 });
    await recordBreakerOutcome(
      admin as never,
      "org-1",
      "cap-1",
      true,
      new Date("2025-01-02T00:00:00.000Z")
    );
    expect(admin.queries.capability_breakers.update).toHaveBeenCalled();
  });

  test("read errors fail closed", async () => {
    const admin = adminFor(null, new Error("offline"));
    await expect(
      readBreakerState(
        admin as never,
        "org-1",
        "cap-1",
        new Date("2025-01-02T00:00:00.000Z")
      )
    ).resolves.toMatchObject({ state: "open", open: true });
  });
});
