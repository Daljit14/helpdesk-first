const MAX_RESPONSE_BYTES = 256 * 1024;
const TIMEOUT_MS = 8000;

export type StatusHttpErrorKind =
  | "timeout"
  | "too_large"
  | "rate_limited"
  | "unavailable"
  | "unauthorized"
  | "invalid_response";

export type StatusHttpResult<T> =
  { ok: true; value: T } | { ok: false; error: { kind: StatusHttpErrorKind } };

function statusError(status: number): StatusHttpErrorKind {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "invalid_response";
}

export async function fetchStatusJson<T>(
  url: string,
  parse: (value: unknown) => T,
  signal: AbortSignal
): Promise<StatusHttpResult<T>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(signal.reason);
    if (signal.aborted) abortFromCaller();
    else signal.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
    timeout.unref?.();

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        redirect: "error",
        credentials: "omit",
      });
      if (!response.ok) {
        if (
          attempt === 0 &&
          (response.status === 429 || response.status >= 500)
        )
          continue;
        return { ok: false, error: { kind: statusError(response.status) } };
      }
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES)
        return { ok: false, error: { kind: "too_large" } };

      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES)
        return { ok: false, error: { kind: "too_large" } };
      try {
        return { ok: true, value: parse(JSON.parse(text) as unknown) };
      } catch {
        return { ok: false, error: { kind: "invalid_response" } };
      }
    } catch {
      return {
        ok: false,
        error: { kind: timedOut || signal.aborted ? "timeout" : "unavailable" },
      };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abortFromCaller);
    }
  }
  return { ok: false, error: { kind: "unavailable" } };
}
