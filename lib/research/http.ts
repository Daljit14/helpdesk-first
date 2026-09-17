import { z } from "zod";
import type { ResearchResult } from "./types";

const MAX_RESPONSE_BYTES = 256 * 1024;

function errorForStatus(status: number) {
  if (status === 401 || status === 403)
    return {
      kind: "unauthorized" as const,
      message: "Research authorization failed",
    };
  if (status === 429)
    return {
      kind: "rate_limited" as const,
      message: "Research rate limit exceeded",
    };
  if (status >= 500)
    return {
      kind: "unavailable" as const,
      message: "Research provider unavailable",
    };
  return {
    kind: "invalid_response" as const,
    message: "Research request failed",
  };
}

export async function researchFetch<T>(
  url: string,
  init: RequestInit,
  parse: (json: unknown) => T,
  signal: AbortSignal
): Promise<ResearchResult<T>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const timeoutSignal =
        typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(8000)
          : null;
      const requestSignal =
        timeoutSignal && typeof AbortSignal.any === "function"
          ? AbortSignal.any([signal, timeoutSignal])
          : signal;
      const response = await fetch(url, {
        ...init,
        signal: requestSignal,
      });
      if (!response.ok) {
        if (
          attempt === 0 &&
          (response.status === 429 || response.status >= 500)
        )
          continue;
        return { ok: false, error: errorForStatus(response.status) };
      }
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        return {
          ok: false,
          error: { kind: "too_large", message: "Research response too large" },
        };
      }
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        return {
          ok: false,
          error: { kind: "too_large", message: "Research response too large" },
        };
      }
      const json: unknown = JSON.parse(text);
      return { ok: true, value: parse(json) };
    } catch (error) {
      if (error instanceof z.ZodError)
        return {
          ok: false,
          error: {
            kind: "invalid_response",
            message: "Invalid research response",
          },
        };
      if (error instanceof DOMException && error.name === "AbortError")
        return {
          ok: false,
          error: { kind: "timeout", message: "Research request timed out" },
        };
      return {
        ok: false,
        error: {
          kind: "invalid_response",
          message: "Invalid research response",
        },
      };
    }
  }
  return {
    ok: false,
    error: { kind: "unavailable", message: "Research provider unavailable" },
  };
}
