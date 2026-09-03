import type { NextRequest } from "next/server";
import { getClientIp, MemoryRateLimiter } from "@/lib/ai/rate-limit";

const MAX_BYTES = 4_000_000; // 4 MB hard cap
const DEFAULT_BYTES = 2_000_000; // 2 MB default
const CHUNK = 65536; // Web Crypto getRandomValues limit per call
const limiter = new MemoryRateLimiter({ windowMs: 60_000, maxRequests: 20 });

function randomPayload(size: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array<ArrayBuffer>(new ArrayBuffer(size));
  for (let offset = 0; offset < size; offset += CHUNK) {
    const end = Math.min(offset + CHUNK, size);
    crypto.getRandomValues(buf.subarray(offset, end));
  }
  return buf;
}

export async function GET(request: NextRequest) {
  const check = await limiter.check(getClientIp(request));
  if (!check.allowed) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(check.retryAfter ?? 60) },
    });
  }

  const requested = Number(request.nextUrl.searchParams.get("bytes"));
  const bytes =
    Number.isInteger(requested) && requested > 0
      ? Math.min(requested, MAX_BYTES)
      : DEFAULT_BYTES;

  return new Response(randomPayload(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes),
      "Cache-Control": "no-store",
    },
  });
}
