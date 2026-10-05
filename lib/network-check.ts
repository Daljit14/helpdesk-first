export type LatencySample = { ok: boolean; ms: number };

export type ConnectionInfo = {
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean | null;
};

export type DownloadFailure = "timeout" | "rate-limited" | "failed" | "aborted";

export type DownloadResult =
  | { ok: true; mbps: number; bytes: number; seconds: number }
  | { ok: false; reason: DownloadFailure };

const PING_TIMEOUT_MS = 5000;
const DOWNLOAD_TIMEOUT_MS = 20000;

/** Pure: megabits per second for `bytes` moved in `seconds` (null if unusable). */
export function computeMbps(bytes: number, seconds: number): number | null {
  if (!Number.isFinite(bytes) || !Number.isFinite(seconds)) return null;
  if (bytes <= 0 || seconds <= 0) return null;
  // Floor at 20 ms so a cached/instant response can't report absurd speeds.
  const safeSeconds = Math.max(seconds, 0.02);
  return (bytes * 8) / 1_000_000 / safeSeconds;
}

/** One round trip to our own ping endpoint, with a timeout. */
export async function measureLatencyOnce(
  timeoutMs = PING_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<LatencySample> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const start = performance.now();
  try {
    const res = await fetch(`/api/network-check/ping?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    await res.arrayBuffer();
    return { ok: res.ok, ms: performance.now() - start };
  } catch {
    return { ok: false, ms: Number.POSITIVE_INFINITY };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Round-trips to our own /api/network-check/ping endpoint a few times and
 * times each one client-side. This measures latency to *this app*, not the
 * user's whole internet — which is exactly what's useful for "is it my
 * network or is it this site" triage.
 */
export async function measureLatency(samples = 4): Promise<LatencySample[]> {
  const results: LatencySample[] = [];
  for (let i = 0; i < samples; i++) results.push(await measureLatencyOnce());
  return results;
}

export function summarizeLatency(samples: LatencySample[]): {
  avgMs: number | null;
  jitterMs: number | null;
} {
  const ok = samples.filter((s) => s.ok && Number.isFinite(s.ms));
  if (ok.length === 0) return { avgMs: null, jitterMs: null };

  const avg = ok.reduce((sum, s) => sum + s.ms, 0) / ok.length;
  const variance =
    ok.reduce((sum, s) => sum + (s.ms - avg) ** 2, 0) / ok.length;

  return { avgMs: avg, jitterMs: Math.sqrt(variance) };
}

/**
 * Downloads random (incompressible, uncacheable) payloads from our own edge
 * over a few parallel connections and times them from first byte to last, so
 * connection set-up latency doesn't drag down the number on fast links.
 * Rough (one region, one site) but fine for "is my download reasonable".
 */
export async function measureDownload(
  options: {
    streams?: number;
    bytesPerStream?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<DownloadResult> {
  const {
    streams = 3,
    bytesPerStream = 3_000_000,
    timeoutMs = DOWNLOAD_TIMEOUT_MS,
    signal,
  } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  let rateLimited = false;
  const firstByteAt: number[] = [];
  let lastByteAt = 0;

  const one = async (index: number): Promise<number> => {
    const res = await fetch(
      `/api/network-check/payload?bytes=${bytesPerStream}&t=${Date.now()}-${index}`,
      { cache: "no-store", signal: controller.signal }
    );
    if (res.status === 429) {
      rateLimited = true;
      throw new Error("rate-limited");
    }
    if (!res.ok) throw new Error(`status ${res.status}`);
    let received = 0;
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (received === 0) firstByteAt.push(performance.now());
        received += value.byteLength;
      }
    } else {
      received = (await res.arrayBuffer()).byteLength;
      firstByteAt.push(performance.now());
    }
    lastByteAt = Math.max(lastByteAt, performance.now());
    return received;
  };

  try {
    const sizes = await Promise.all(
      Array.from({ length: streams }, (_, i) => one(i))
    );
    const total = sizes.reduce((a, b) => a + b, 0);
    const seconds = (lastByteAt - Math.min(...firstByteAt)) / 1000;
    const mbps = computeMbps(total, seconds);
    if (mbps === null) return { ok: false, reason: "failed" };
    return { ok: true, mbps, bytes: total, seconds };
  } catch {
    if (signal?.aborted) return { ok: false, reason: "aborted" };
    if (timedOut) return { ok: false, reason: "timeout" };
    return { ok: false, reason: rateLimited ? "rate-limited" : "failed" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    controller.abort(); // cancel any stream still in flight after a failure
  }
}

/** Back-compat wrapper: Mbps or null. */
export async function measureDownloadSpeed(
  bytes = 2_000_000
): Promise<number | null> {
  const result = await measureDownload({ streams: 1, bytesPerStream: bytes });
  return result.ok ? result.mbps : null;
}

/**
 * navigator.connection is Chromium-only and non-standard — returns null
 * gracefully on Safari/Firefox rather than throwing.
 */
export function getConnectionInfo(): ConnectionInfo | null {
  if (typeof navigator === "undefined") return null;

  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
  };

  const conn = nav.connection;
  if (!conn) return null;

  return {
    effectiveType: conn.effectiveType ?? null,
    downlinkMbps: conn.downlink ?? null,
    rttMs: conn.rtt ?? null,
    saveData: conn.saveData ?? null,
  };
}
