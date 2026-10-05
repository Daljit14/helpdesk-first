/**
 * Browser-only helpers for the networking & security tools.
 *
 * External origins contacted (all optional, user-triggered, no cookies):
 *  - https://www.cloudflare.com/cdn-cgi/trace   (stability comparison, connection info)
 *  - https://cloudflare-dns.com/dns-query       (DNS check)
 *  - https://dns.google/resolve                 (DNS check)
 *  - https://api.pwnedpasswords.com/range/      (breach check, first 5 SHA-1 chars only)
 * Same-origin: /api/network-check/ping
 */
import {
  parseDoh,
  parsePwnedRange,
  parseTrace,
  sha1Hex,
  splitHash,
  type ResolverOutcome,
  type TraceInfo,
} from "./net-sec-logic";

export const SAME_ORIGIN_PING = "/api/network-check/ping";
export const TRACE_URL = "https://www.cloudflare.com/cdn-cgi/trace";

export function errorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError")
    return "timed out";
  if (err instanceof Error && err.name === "AbortError") return "timed out";
  return err instanceof Error && err.message ? err.message : "request failed";
}

/** Fetch with a hard timeout and an optional outer cancel signal. */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
  outer?: AbortSignal
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener("abort", onOuter, { once: true });
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuter);
  }
}

let probeCounter = 0;

/** One small no-store probe. Resolves with milliseconds, or null on failure / timeout. */
export async function timedProbe(
  url: string,
  timeoutMs: number,
  outer?: AbortSignal
): Promise<number | null> {
  const sep = url.includes("?") ? "&" : "?";
  const target = `${url}${sep}_=${++probeCounter}`;
  const start = performance.now();
  try {
    await fetchWithTimeout(
      target,
      timeoutMs,
      { cache: "no-store", mode: "no-cors", credentials: "omit" },
      outer
    );
    return performance.now() - start;
  } catch {
    return null;
  }
}

/** Sleep that resolves early (true) when `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(true);
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(false);
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve(true);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchTrace(timeoutMs = 6000): Promise<TraceInfo> {
  const res = await fetchWithTimeout(TRACE_URL, timeoutMs, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  const info = parseTrace(await res.text());
  if (!info) throw new Error("Unexpected response from the lookup service");
  return info;
}

export type Resolver = {
  id: "cloudflare" | "google";
  label: string;
  url: string;
};
export const RESOLVERS: Resolver[] = [
  {
    id: "cloudflare",
    label: "Cloudflare (1.1.1.1)",
    url: "https://cloudflare-dns.com/dns-query",
  },
  {
    id: "google",
    label: "Google (8.8.8.8)",
    url: "https://dns.google/resolve",
  },
];

export async function resolveDoh(
  resolver: Resolver,
  name: string,
  type: string,
  timeoutMs = 6000
): Promise<ResolverOutcome> {
  const start = performance.now();
  try {
    const url = `${resolver.url}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
    const res = await fetchWithTimeout(url, timeoutMs, {
      headers: { accept: "application/dns-json" },
      cache: "no-store",
      credentials: "omit",
    });
    const ms = performance.now() - start;
    if (!res.ok) return { ok: false, ms, error: `HTTP ${res.status}` };
    const parsed = parseDoh(await res.json());
    if (!parsed) return { ok: false, ms, error: "Unexpected response" };
    return { ok: true, ms, result: parsed };
  } catch (err) {
    return { ok: false, ms: null, error: errorMessage(err) };
  }
}

/** HaveIBeenPwned k-anonymity lookup. Only the first 5 hex chars of the SHA-1 leave the browser. */
export async function pwnedCount(
  password: string,
  timeoutMs = 8000
): Promise<number> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error(
      "Your browser can't hash passwords here (it needs a secure https connection)."
    );
  }
  const { prefix, suffix } = splitHash(await sha1Hex(password));
  const res = await fetchWithTimeout(
    `https://api.pwnedpasswords.com/range/${prefix}`,
    timeoutMs,
    {
      headers: { "Add-Padding": "true" },
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    }
  );
  if (!res.ok) throw new Error(`Breach service returned ${res.status}`);
  return parsePwnedRange(await res.text(), suffix);
}

/** Cryptographically secure fill for the generators. */
export function secureFill(buf: Uint32Array): Uint32Array {
  crypto.getRandomValues(buf as never); // cast keeps this compiling across TS 5.x typed-array lib changes
  return buf;
}
