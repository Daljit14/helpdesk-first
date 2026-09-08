import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { getDailyCallBudget } from "./config";

const fallbackCounts = new Map<string, number>();
const limiters = new Map<string, RateLimiter>();

function utcDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function checkAndConsumeDailyBudget(): Promise<boolean> {
  const budget = getDailyCallBudget();
  if (budget === 0) return true;
  const now = new Date();
  const key = utcDateKey(now);
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  try {
    const limiter =
      limiters.get(key) ??
      createRateLimiter(
        {
          windowMs: Math.max(1000, end - now.getTime()),
          maxRequests: budget,
        },
        `ai-budget-${key}`
      );
    limiters.set(key, limiter);
    const result = await limiter.check(`ai:budget:${key}`);
    if (result.allowed) return true;
  } catch {
    const count = fallbackCounts.get(key) ?? 0;
    if (count < budget) {
      fallbackCounts.set(key, count + 1);
      return true;
    }
  }
  return false;
}
