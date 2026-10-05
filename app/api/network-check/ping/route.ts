import { getClientIp, MemoryRateLimiter } from "@/lib/ai/rate-limit";

const limiter = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 60 });

export async function GET(request: Request) {
  const check = await limiter.check(getClientIp(request));
  if (!check.allowed) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(check.retryAfter ?? 60) },
    });
  }

  return Response.json(
    { ok: true, serverTime: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
