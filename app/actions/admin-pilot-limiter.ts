import { createRateLimiter, getRateLimitConfig } from "@/lib/ai/rate-limit";

export const pilotActionLimiter = createRateLimiter(
  { ...getRateLimitConfig(), maxRequests: 30 },
  "pilot-actions"
);
