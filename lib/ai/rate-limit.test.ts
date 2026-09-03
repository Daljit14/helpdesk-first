import { describe, expect, test } from "vitest";
import { checkRateLimit, MemoryRateLimiter } from "./rate-limit";

describe("MemoryRateLimiter", () => {
  test("allows requests under the limit", async () => {
    const limiter = new MemoryRateLimiter({ windowMs: 60000, maxRequests: 3 });
    expect(await limiter.check("a")).toEqual({ allowed: true });
    expect(await limiter.check("a")).toEqual({ allowed: true });
    expect(await limiter.check("a")).toEqual({ allowed: true });
  });

  test("blocks requests over the limit", async () => {
    const limiter = new MemoryRateLimiter({ windowMs: 60000, maxRequests: 2 });
    expect((await limiter.check("b")).allowed).toBe(true);
    expect((await limiter.check("b")).allowed).toBe(true);
    const result = await limiter.check("b");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/too many requests/i);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test("tracks identifiers separately", async () => {
    const limiter = new MemoryRateLimiter({ windowMs: 60000, maxRequests: 1 });
    expect((await limiter.check("c")).allowed).toBe(true);
    expect((await limiter.check("d")).allowed).toBe(true);
  });
});

describe("checkRateLimit", () => {
  test("returns allowed false with no limiter configured", async () => {
    const request = new Request("http://localhost/api/ai/intake");
    const result = await checkRateLimit(request, null);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/rate limiting.*not configured/i);
  });
});
