import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type {
  RateLimitCheck,
  RateLimitConfig,
  RateLimiter,
} from "./rate-limit";

const cached = new Map<string, Ratelimit>();

function getUpstashRatelimit(
  config: RateLimitConfig,
  prefix: string
): Ratelimit {
  const cacheKey = `${prefix}:${config.windowMs}:${config.maxRequests}`;
  const existing = cached.get(cacheKey);
  if (existing) return existing;

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or the Vercel " +
        "Upstash integration's KV_REST_API_URL and KV_REST_API_TOKEN) must be " +
        "set to use HELP_DESK_AI_RATE_LIMIT_PROVIDER=upstash."
    );
  }

  const ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(
      config.maxRequests,
      `${config.windowMs} ms`
    ),
    analytics: true,
    prefix,
  });

  cached.set(cacheKey, ratelimit);
  return ratelimit;
}

/**
 * A real distributed rate limiter for the AI intake endpoint. Vercel runs
 * many concurrent, short-lived function instances across regions — an
 * in-memory counter (see MemoryRateLimiter) doesn't share state between
 * them, so it can't actually enforce a limit in production. This uses
 * Upstash's REST-based Redis, which works from serverless/edge without a
 * persistent connection.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly ratelimit: Ratelimit;

  constructor(config: RateLimitConfig, prefix = "helpdesk-first:ai-intake") {
    this.ratelimit = getUpstashRatelimit(config, prefix);
  }

  async check(identifier: string): Promise<RateLimitCheck> {
    const result = await this.ratelimit.limit(identifier);

    if (!result.success) {
      const retryAfter = Math.max(
        0,
        Math.ceil((result.reset - Date.now()) / 1000)
      );
      return {
        allowed: false,
        retryAfter,
        reason: "Too many requests. Please wait before trying again.",
      };
    }

    return { allowed: true };
  }
}
