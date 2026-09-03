export type RateLimitCheck = {
  allowed: boolean;
  retryAfter?: number;
  reason?: string;
};

export interface RateLimiter {
  check(identifier: string): Promise<RateLimitCheck>;
}

export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export function getRateLimitConfig(): RateLimitConfig {
  const parsedWindow = parseInt(
    process.env.HELP_DESK_AI_RATE_LIMIT_WINDOW_MS ?? "60000",
    10
  );
  const parsedMax = parseInt(
    process.env.HELP_DESK_AI_RATE_LIMIT_MAX ?? "30",
    10
  );

  return {
    windowMs:
      Number.isNaN(parsedWindow) || parsedWindow <= 0 ? 60000 : parsedWindow,
    maxRequests: Number.isNaN(parsedMax) || parsedMax <= 0 ? 30 : parsedMax,
  };
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly store = new Map<string, number[]>();
  private readonly config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...getRateLimitConfig(), ...config };
  }

  async check(identifier: string): Promise<RateLimitCheck> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const timestamps = this.store.get(identifier) ?? [];
    const recent = timestamps.filter((t) => t > windowStart);

    if (recent.length >= this.config.maxRequests) {
      const oldest = recent[0] ?? now;
      const retryAfter = Math.ceil(
        (oldest + this.config.windowMs - now) / 1000
      );
      this.store.set(identifier, recent);
      return {
        allowed: false,
        retryAfter,
        reason: "Too many requests. Please wait before trying again.",
      };
    }

    recent.push(now);
    this.store.set(identifier, recent);
    return { allowed: true };
  }
}

export class DisabledRateLimiter implements RateLimiter {
  async check(): Promise<RateLimitCheck> {
    return { allowed: true };
  }
}

export type RateLimiterKind = "memory" | "disabled" | "external" | null;

export function getRateLimiterKind(): RateLimiterKind {
  const env = process.env.HELP_DESK_AI_RATE_LIMIT_PROVIDER;
  if (env === "memory") return "memory";
  if (env === "disabled") return "disabled";
  if (env === "vercel-firewall" || env === "external") return "external";
  return null;
}

export function getRateLimiter(): RateLimiter | null {
  const kind = getRateLimiterKind();

  if (kind === "disabled") {
    return new DisabledRateLimiter();
  }

  if (kind === "external") {
    // Trusts an upstream managed rate limiter such as Vercel Firewall.
    return new DisabledRateLimiter();
  }

  if (kind === "memory") {
    return new MemoryRateLimiter();
  }

  // Auto-select a safe in-memory limiter for tests and preview environments.
  // Production must explicitly configure a managed rate limiter.
  if (
    process.env.NODE_ENV === "test" ||
    process.env.VERCEL_ENV === "preview" ||
    process.env.CI === "true"
  ) {
    return new MemoryRateLimiter();
  }

  return null;
}

export function getClientIp(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  return "unknown";
}

export async function checkRateLimit(
  request: Request,
  limiter: RateLimiter | null
): Promise<RateLimitCheck> {
  if (!limiter) {
    return {
      allowed: false,
      reason: "Rate limiting is not configured for the AI endpoint.",
    };
  }

  const identifier = getClientIp(request);
  return limiter.check(identifier);
}
