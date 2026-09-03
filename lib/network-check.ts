export type LatencySample = { ok: boolean; ms: number };

export type ConnectionInfo = {
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  saveData: boolean | null;
};

/**
 * Round-trips to our own /api/network-check/ping endpoint a few times and
 * times each one client-side. This measures latency to *this app*, not the
 * user's whole internet — which is exactly what's useful for "is it my
 * network or is it this site" triage.
 */
export async function measureLatency(samples = 4): Promise<LatencySample[]> {
  const results: LatencySample[] = [];

  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    try {
      const res = await fetch(`/api/network-check/ping?t=${Date.now()}`, {
        cache: "no-store",
      });
      results.push({ ok: res.ok, ms: performance.now() - start });
    } catch {
      results.push({ ok: false, ms: Number.POSITIVE_INFINITY });
    }
  }

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
 * Downloads a fixed-size random payload from our own edge and times it to
 * estimate throughput. Rough (one connection, one region) but good enough
 * for "is my download speed reasonable" triage.
 */
export async function measureDownloadSpeed(
  bytes = 2_000_000
): Promise<number | null> {
  const start = performance.now();
  try {
    const res = await fetch(
      `/api/network-check/payload?bytes=${bytes}&t=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;

    const blob = await res.blob();
    const seconds = (performance.now() - start) / 1000;
    if (seconds <= 0) return null;

    const megabits = (blob.size * 8) / 1_000_000;
    return megabits / seconds;
  } catch {
    return null;
  }
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
