import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

const DNS_TIMEOUT_MS = 2000;

function ipv4Octets(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) =>
    /^\d{1,3}$/.test(part) ? Number(part) : -1
  );
  return octets.some((octet) => octet < 0 || octet > 255) ? null : octets;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [first, second, third] = octets;
  if (first === 0 || first === 10 || first === 127) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 0 && (third === 0 || third === 2))
    return true;
  if (first === 192 && second === 88 && third === 99) return true;
  if (first === 192 && second === 168) return true;
  if (first === 198 && (second === 18 || second === 19)) return true;
  if (first === 198 && second === 51 && third === 100) return true;
  if (first === 203 && second === 0 && third === 113) return true;
  return first >= 224;
}

function ipv6Groups(value: string): number[] | null {
  let text = value;
  const lastColon = text.lastIndexOf(":");
  if (lastColon < 0) return null;
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = ipv4Octets(tail);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let parts: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    parts = head;
  } else {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return null;
    parts = [...head, ...Array<string>(missing).fill("0"), ...rest];
  }
  const groups = parts.map((part) =>
    /^[0-9a-fA-F]{1,4}$/.test(part) ? Number.parseInt(part, 16) : -1
  );
  return groups.some((group) => group < 0) ? null : groups;
}

function embeddedIpv4(high: number, low: number): number[] {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function isPrivateIpv6(groups: number[]): boolean {
  const leadingZeros = groups.slice(0, 5).every((group) => group === 0);
  if (leadingZeros && groups[5] === 0xffff)
    return isPrivateIpv4(embeddedIpv4(groups[6], groups[7]));
  if (leadingZeros && groups[5] === 0) return true;
  if (
    groups[0] === 0x64 &&
    groups[1] === 0xff9b &&
    groups.slice(2, 6).every((group) => group === 0)
  )
    return isPrivateIpv4(embeddedIpv4(groups[6], groups[7]));
  if (groups[0] === 0x2002)
    return isPrivateIpv4(embeddedIpv4(groups[1], groups[2]));
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true;
  if (groups[0] === 0x0100 && groups.slice(1, 4).every((group) => group === 0))
    return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xffc0) === 0xfec0) return true;
  return (groups[0] & 0xff00) === 0xff00;
}

export function isPrivateAddress(ip: string): boolean {
  const input = ip.trim();
  const zoneIndex = input.indexOf("%");
  const value = zoneIndex >= 0 ? input.slice(0, zoneIndex) : input;
  if (zoneIndex >= 0 && !value.includes(":")) return true;
  const bare =
    value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  const version = isIP(bare);
  if (version === 4) {
    const octets = ipv4Octets(bare);
    return octets === null ? true : isPrivateIpv4(octets);
  }
  if (version === 6) {
    const groups = ipv6Groups(bare);
    return groups === null ? true : isPrivateIpv6(groups);
  }
  return true;
}

export const systemResolver: HostResolver = async (hostname) => {
  const entries = await lookup(hostname, { all: true, verbatim: true });
  return entries.map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? 6 : 4,
  }));
};

function resolveGuard(signal: AbortSignal): {
  promise: Promise<never>;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("dns_timeout")), DNS_TIMEOUT_MS);
    onAbort = () => reject(new Error("dns_aborted"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  return {
    promise,
    dispose: () => {
      if (timer) clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
    },
  };
}

export async function resolvePublicHost(
  hostname: string,
  signal: AbortSignal,
  resolver: HostResolver = systemResolver
): Promise<
  | { ok: true; address: ResolvedAddress }
  | { ok: false; reason: "private_network" | "dns_failed" }
> {
  const guard = resolveGuard(signal);
  try {
    const addresses = await Promise.race([resolver(hostname), guard.promise]);
    if (!Array.isArray(addresses) || addresses.length === 0)
      return { ok: false, reason: "dns_failed" };
    if (
      addresses.some(
        (entry) =>
          !entry ||
          typeof entry.address !== "string" ||
          (entry.family !== 4 && entry.family !== 6)
      )
    )
      return { ok: false, reason: "dns_failed" };
    if (addresses.some((entry) => isPrivateAddress(entry.address)))
      return { ok: false, reason: "private_network" };
    return { ok: true, address: addresses[0] };
  } catch {
    return { ok: false, reason: "dns_failed" };
  } finally {
    guard.dispose();
  }
}

export function pinnedLookup(pinned: ResolvedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ ...pinned }]);
    else callback(null, pinned.address, pinned.family);
  };
}

export function pinnedFetch(
  url: URL,
  init: RequestInit,
  pinned: ResolvedAddress
): Promise<Response> {
  if (url.protocol !== "https:")
    throw new Error("pinned fetch requires an https URL");
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => {
    headers[key] = value;
  });
  headers.host = url.host;
  return new Promise<Response>((resolve, reject) => {
    const request = https.request(
      {
        host: url.hostname,
        servername: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        signal: init.signal ?? undefined,
        agent: false,
        lookup: pinnedLookup(pinned),
      },
      (response) => {
        const status = response.statusCode ?? 502;
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (value === undefined) continue;
          responseHeaders.set(
            key,
            Array.isArray(value) ? value.join(", ") : String(value)
          );
        }
        const empty = status === 204 || status === 304 || method === "HEAD";
        if (empty) response.resume();
        resolve(
          new Response(
            empty
              ? null
              : (Readable.toWeb(response) as ReadableStream<Uint8Array>),
            {
              status,
              statusText: response.statusMessage ?? "",
              headers: responseHeaders,
            }
          )
        );
      }
    );
    request.on("error", reject);
    request.end();
  });
}
