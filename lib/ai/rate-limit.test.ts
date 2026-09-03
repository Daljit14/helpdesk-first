import { describe, expect, test, vi } from "vitest";
import {
  checkRateLimit,
  getRateLimiter,
  getRateLimiterKind,
  MemoryRateLimiter,
} from "./rate-limit";

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

describe("UpstashRateLimiter configuration", () => {
  test("requires Upstash environment variables", () => {
    vi.stubEnv("HELP_DESK_AI_RATE_LIMIT_PROVIDER", "upstash");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");

    expect(getRateLimiterKind()).toBe("upstash");
    expect(() => getRateLimiter()).toThrow(/UPSTASH_REDIS_REST_URL/);

    vi.unstubAllEnvs();
  });
});
