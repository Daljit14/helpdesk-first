import type { ConnectorError, ConnectorResult } from "./types";

const MAX_RESPONSE_BYTES = 256 * 1024;

function errorForStatus(status: number): ConnectorError {
  if (status === 401 || status === 403)
    return { kind: "unauthorized", message: "Connector authorization failed" };
  if (status === 404)
    return { kind: "not_found", message: "Directory resource not found" };
  if (status === 429)
    return { kind: "rate_limited", message: "Directory rate limit exceeded" };
  if (status >= 500)
    return { kind: "unavailable", message: "Directory service unavailable" };
  return { kind: "invalid_response", message: "Directory request failed" };
}

export async function connectorFetch<T>(
  url: string,
  init: RequestInit,
  parse: (value: unknown) => T,
  retryRead = false
): Promise<ConnectorResult<T>> {
  for (let attempt = 0; attempt < (retryRead ? 2 : 1); attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        const error = errorForStatus(response.status);
        if (
          retryRead &&
          attempt === 0 &&
          (response.status === 429 || response.status >= 500)
        )
          continue;
        return { ok: false, error };
      }
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        return {
          ok: false,
          error: { kind: "invalid_response", message: "Response too large" },
        };
      }
      const body = await response.text();
      if (body.length > MAX_RESPONSE_BYTES) {
        return {
          ok: false,
          error: { kind: "invalid_response", message: "Response too large" },
        };
      }
      return { ok: true, value: parse(JSON.parse(body) as unknown) };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          ok: false,
          error: {
            kind: "unavailable",
            message: "Directory request timed out",
          },
        };
      }
      return {
        ok: false,
        error: {
          kind: "invalid_response",
          message: "Invalid connector response",
        },
      };
    }
  }
  return {
    ok: false,
    error: { kind: "unavailable", message: "Directory request failed" },
  };
}
