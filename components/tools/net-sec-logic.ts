/**
 * Pure logic for the networking & security toolkit tools.
 *
 * Nothing in this file touches the network, the DOM or storage, so it is
 * easy to unit test. The browser-only helpers (fetch, SubtleCrypto) that
 * feed it live in `net-probe.ts`.
 */
import type { Tone } from "./diagnostics";

/* ------------------------------------------------------------------ */
/* Latency / stability maths                                           */
/* ------------------------------------------------------------------ */

export type Sample = number | null; // ms, or null when the probe failed / timed out

export type LatencyStats = {
  sent: number;
  received: number;
  lossPct: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  /** Mean absolute difference between consecutive successful probes. */
  jitter: number | null;
  p95: number | null;
};

export function latencyStats(samples: Sample[]): LatencyStats {
  const ok = samples.filter(
    (s): s is number => typeof s === "number" && Number.isFinite(s) && s >= 0
  );
  const sent = samples.length;
  const lossPct =
    sent === 0 ? 0 : Math.round(((sent - ok.length) / sent) * 1000) / 10;
  if (ok.length === 0) {
    return {
      sent,
      received: 0,
      lossPct,
      avg: null,
      min: null,
      max: null,
      jitter: null,
      p95: null,
    };
  }
  const sum = ok.reduce((a, b) => a + b, 0);
  let jitter: number | null = null;
  if (ok.length > 1) {
    let diff = 0;
    for (let i = 1; i < ok.length; i++) diff += Math.abs(ok[i] - ok[i - 1]);
    jitter = diff / (ok.length - 1);
  }
  const sorted = [...ok].sort((a, b) => a - b);
  const p95 =
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
  return {
    sent,
    received: ok.length,
    lossPct,
    avg: sum / ok.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    jitter,
    p95,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function fmtMs(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${Math.round(value)} ms`;
}

export type StabilityVerdict = "good" | "stutter" | "drop" | "offline";
export type StabilityCulprit = "none" | "local" | "route" | "unknown";

export type StabilityDiagnosis = {
  verdictKey: StabilityVerdict;
  verdict: string;
  tone: Tone;
  tip: string;
  culprit: StabilityCulprit;
};

export function classifyStability(s: LatencyStats): StabilityVerdict {
  if (s.received === 0) return "offline";
  if (s.lossPct >= 5 || (s.avg ?? 0) > 400 || (s.jitter ?? 0) > 120)
    return "drop";
  if (
    s.lossPct >= 1 ||
    (s.jitter ?? 0) > 40 ||
    (s.p95 ?? 0) > 250 ||
    (s.avg ?? 0) > 200
  )
    return "stutter";
  return "good";
}

/** Share of rounds where BOTH paths failed, out of rounds where at least one failed. */
export function correlatedLossShare(a: Sample[], b: Sample[]): number | null {
  const n = Math.min(a.length, b.length);
  let any = 0;
  let both = 0;
  for (let i = 0; i < n; i++) {
    const fa = a[i] === null;
    const fb = b[i] === null;
    if (fa || fb) any++;
    if (fa && fb) both++;
  }
  return any === 0 ? null : both / any;
}

/**
 * Compare the same-origin path (this site) with a second public endpoint.
 * Both travel over your Wi-Fi first, so when BOTH look bad the problem is
 * most likely the shared first hop (Wi-Fi / router / ISP line); when only
 * one is bad it is more likely that service or the route to it.
 */
export function diagnoseStability(
  site: Sample[],
  other: Sample[] | null
): StabilityDiagnosis {
  const a = latencyStats(site);
  const b = other ? latencyStats(other) : null;
  const level = classifyStability(a);
  const otherUsable = b !== null && b.received > 0;
  const otherLevel = otherUsable && b ? classifyStability(b) : null;

  if (level === "offline") {
    return {
      verdictKey: "offline",
      verdict: "Likely to drop — no replies at all",
      tone: "bad",
      culprit: "local",
      tip: "Nothing came back from this site. Check that Wi-Fi or the cable is connected, then try again. If other sites work, the problem is only with this site or your network is blocking it.",
    };
  }

  let culprit: StabilityCulprit = "none";
  let extra = "";
  if (level !== "good" || otherLevel === "stutter" || otherLevel === "drop") {
    if (otherLevel === null) {
      culprit = "unknown";
      extra =
        " The second test endpoint could not be reached, so we could not compare paths (your network or browser policy may block it).";
    } else if (level !== "good" && otherLevel !== "good") {
      const shared = correlatedLossShare(site, other ?? []);
      culprit = "local";
      extra =
        shared !== null && shared >= 0.5
          ? " Both paths dropped at the same moments — a strong sign of a weak Wi-Fi signal, router, or ISP line."
          : " Both paths were unsteady, which usually points to your Wi-Fi, router or internet line rather than one website.";
    } else {
      culprit = "route";
      extra =
        level !== "good"
          ? " The other test endpoint looked fine, so the trouble is more likely on the route to this site than on your Wi-Fi."
          : " This site looked fine but the other endpoint did not, so the issue is probably that service or its route, not your Wi-Fi.";
    }
  }

  if (level === "good") {
    return {
      verdictKey: "good",
      verdict: "Good for video calls",
      tone: "good",
      culprit,
      tip: `Replies were quick and steady with ${a.lossPct}% loss. If calls still break up, the cause is more likely the call app, your device load, or the other person's connection.${extra}`,
    };
  }
  if (level === "stutter") {
    return {
      verdictKey: "stutter",
      verdict: "Calls may stutter",
      tone: "warn",
      culprit,
      tip: `Latency was uneven or a few replies were lost. Move closer to the router, pause big downloads and uploads, and try again.${extra}`,
    };
  }
  return {
    verdictKey: "drop",
    verdict: "Likely to drop",
    tone: "bad",
    culprit,
    tip: `Many replies were slow or lost, so calls and meetings will probably freeze or disconnect. Try a wired connection or sit next to the router, then restart the router.${extra}`,
  };
}

/** Builds the polyline points string for a sparkline (failed probes are skipped, drawn as gaps by the caller). */
export function sparkPoints(
  samples: Sample[],
  width: number,
  height: number,
  maxPoints = 30,
  yMax?: number
): { points: { x: number; y: number }[]; lost: number[] } {
  const slice = samples.slice(-maxPoints);
  const ok = slice.filter((v): v is number => v !== null);
  const top = Math.max(yMax ?? 0, ...ok, 50);
  const step = slice.length > 1 ? width / (maxPoints - 1) : 0;
  const points: { x: number; y: number }[] = [];
  const lost: number[] = [];
  slice.forEach((v, i) => {
    const x = i * step;
    if (v === null) lost.push(x);
    else
      points.push({
        x,
        y: height - (Math.min(v, top) / top) * (height - 4) - 2,
      });
  });
  return { points, lost };
}

/* ------------------------------------------------------------------ */
/* Cloudflare trace parsing                                            */
/* ------------------------------------------------------------------ */

export type TraceInfo = {
  ip: string | null;
  loc: string | null;
  colo: string | null;
  http: string | null;
  tls: string | null;
  warp: string | null;
  gateway: string | null;
  raw: Record<string, string>;
};

export function parseTrace(text: string): TraceInfo | null {
  const raw: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i <= 0) continue;
    raw[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!raw.ip && !raw.loc && !raw.colo) return null;
  return {
    ip: raw.ip ?? null,
    loc: raw.loc ?? null,
    colo: raw.colo ?? null,
    http: raw.http ?? null,
    tls: raw.tls ?? null,
    warp: raw.warp ?? null,
    gateway: raw.gateway ?? null,
    raw,
  };
}

export function isIPv4(v: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  return !!m && m.slice(1).every((p) => Number(p) <= 255);
}

export function isIPv6(v: string): boolean {
  return (
    v.includes(":") &&
    /^[0-9a-f:.]+$/i.test(v) &&
    v.split(":").length >= 3 &&
    v.split(":").length <= 9
  );
}

export function maskIp(ip: string): string {
  if (isIPv4(ip)) {
    const [a, b] = ip.split(".");
    return `${a}.${b}.•••.•••`;
  }
  if (isIPv6(ip)) {
    const first = ip.split(":")[0] || "••••";
    return `${first}:••••:••••:••••`;
  }
  return "••••••••";
}

export function vpnHints(trace: TraceInfo): { label: string; tone: Tone } {
  if (trace.warp === "on" || trace.warp === "plus") {
    return { label: "Cloudflare WARP appears to be on", tone: "info" };
  }
  if (trace.gateway === "on") {
    return {
      label: "Cloudflare Gateway (a managed web filter) appears to be on",
      tone: "info",
    };
  }
  return {
    label:
      "No Cloudflare WARP/Gateway detected (other VPNs can't be detected from a browser)",
    tone: "good",
  };
}

/* ------------------------------------------------------------------ */
/* DNS-over-HTTPS parsing                                              */
/* ------------------------------------------------------------------ */

export const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT"] as const;
export type DnsType = (typeof DNS_TYPES)[number];

const DNS_TYPE_NUM: Record<number, string> = {
  1: "A",
  2: "NS",
  5: "CNAME",
  6: "SOA",
  15: "MX",
  16: "TXT",
  28: "AAAA",
};
const DNS_STATUS: Record<number, string> = {
  0: "OK",
  1: "Format error",
  2: "Server failure",
  3: "Domain does not exist",
  4: "Not implemented",
  5: "Refused",
};

const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;

/** Strips scheme/path/port/trailing dot. Returns "" when there is nothing usable. */
export function normalizeDomain(input: string): string {
  let v = input.trim().toLowerCase();
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  v = v.replace(/^[^@/]*@/, "");
  v = v.split(/[/?#]/)[0];
  v = v.replace(/:\d+$/, "");
  v = v.replace(/\.$/, "");
  return v;
}

export function isValidDomain(value: string): boolean {
  if (!value || value.length > 253) return false;
  const labels = value.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((l) => LABEL_RE.test(l))) return false;
  const tld = labels[labels.length - 1];
  return /^[a-z]{2,63}$/i.test(tld) || /^xn--[a-z0-9-]{1,59}$/i.test(tld);
}

export type DnsAnswer = {
  name: string;
  type: string;
  ttl: number;
  data: string;
};
export type DnsResult = {
  status: number;
  statusLabel: string;
  answers: DnsAnswer[];
  authenticated: boolean;
};

export function parseDoh(json: unknown): DnsResult | null {
  if (!json || typeof json !== "object") return null;
  const j = json as { Status?: unknown; Answer?: unknown; AD?: unknown };
  if (typeof j.Status !== "number") return null;
  const answers: DnsAnswer[] = [];
  if (Array.isArray(j.Answer)) {
    for (const a of j.Answer.slice(0, 50)) {
      if (!a || typeof a !== "object") continue;
      const r = a as {
        name?: unknown;
        type?: unknown;
        TTL?: unknown;
        data?: unknown;
      };
      if (typeof r.data !== "string" || typeof r.type !== "number") continue;
      answers.push({
        name: typeof r.name === "string" ? r.name.replace(/\.$/, "") : "",
        type: DNS_TYPE_NUM[r.type] ?? `TYPE${r.type}`,
        ttl: typeof r.TTL === "number" ? r.TTL : 0,
        data: cleanDnsData(r.data),
      });
    }
  }
  return {
    status: j.Status,
    statusLabel: DNS_STATUS[j.Status] ?? `Status ${j.Status}`,
    answers,
    authenticated: j.AD === true,
  };
}

export function cleanDnsData(data: string): string {
  // TXT data arrives quoted, sometimes as several "chunks" — join them.
  const trimmed = data.trim();
  if (trimmed.startsWith('"')) {
    const parts = trimmed.match(/"((?:[^"\\]|\\.)*)"/g);
    if (parts)
      return parts.map((p) => p.slice(1, -1).replace(/\\(.)/g, "$1")).join("");
  }
  return trimmed.replace(/\.$/, "");
}

export function formatTtl(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export type ResolverOutcome =
  | { ok: true; ms: number; result: DnsResult }
  | { ok: false; ms: number | null; error: string };

export type DnsFinding = { tone: Tone; text: string };

/** Compare two resolvers' answers for one record type. */
export function compareResolvers(
  type: string,
  a: ResolverOutcome,
  b: ResolverOutcome
): DnsFinding[] {
  const out: DnsFinding[] = [];
  if (!a.ok && !b.ok)
    return [
      { tone: "bad", text: `${type}: neither resolver could be reached.` },
    ];
  if (!a.ok || !b.ok) {
    out.push({
      tone: "warn",
      text: `${type}: one resolver failed or timed out, the other answered.`,
    });
    return out;
  }
  const ra = a.result;
  const rb = b.result;
  if (ra.status !== rb.status) {
    out.push({
      tone: "warn",
      text: `${type}: resolvers disagree (${ra.statusLabel} vs ${rb.statusLabel}).`,
    });
    return out;
  }
  if (ra.status !== 0) {
    out.push({
      tone: "bad",
      text: `${type}: both resolvers report "${ra.statusLabel}".`,
    });
    return out;
  }
  const setA = new Set(
    ra.answers.filter((x) => x.type === type).map((x) => x.data.toLowerCase())
  );
  const setB = new Set(
    rb.answers.filter((x) => x.type === type).map((x) => x.data.toLowerCase())
  );
  if (setA.size === 0 && setB.size === 0) return out;
  if (setA.size === 0 || setB.size === 0) {
    out.push({
      tone: "warn",
      text: `${type}: only one resolver returned a record.`,
    });
    return out;
  }
  const overlap = [...setA].some((x) => setB.has(x));
  if (!overlap && (type === "A" || type === "AAAA")) {
    out.push({
      tone: "info",
      text: `${type}: resolvers returned different addresses — normal for big CDNs, suspicious for a small site.`,
    });
  } else if (!overlap) {
    out.push({
      tone: "warn",
      text: `${type}: resolvers returned different records.`,
    });
  }
  return out;
}

export function flushDnsTip(os: string): string {
  const o = os.toLowerCase();
  if (o.includes("windows"))
    return "On Windows, open Command Prompt and run: ipconfig /flushdns";
  if (o.includes("mac"))
    return "On macOS, open Terminal and run: sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder";
  if (o.includes("ipados") || o.includes("ios"))
    return "On iPhone/iPad, toggle Airplane mode on and off (or restart) to clear the DNS cache.";
  if (o.includes("android"))
    return "On Android, toggle Airplane mode, or open chrome://net-internals/#dns and tap Clear host cache.";
  if (o.includes("linux") || o.includes("chrome"))
    return "On Linux, run: resolvectl flush-caches (or restart systemd-resolved / nscd).";
  return "Restart your device (and router) to clear its DNS cache.";
}

/* ------------------------------------------------------------------ */
/* Password strength                                                   */
/* ------------------------------------------------------------------ */

export const COMMON_PASSWORDS: readonly string[] = [
  "password",
  "123456",
  "123456789",
  "12345678",
  "12345",
  "1234567",
  "1234567890",
  "qwerty",
  "abc123",
  "111111",
  "password1",
  "iloveyou",
  "admin",
  "welcome",
  "monkey",
  "login",
  "letmein",
  "dragon",
  "football",
  "baseball",
  "master",
  "sunshine",
  "princess",
  "qwerty123",
  "solo",
  "passw0rd",
  "starwars",
  "whatever",
  "trustno1",
  "hello",
  "freedom",
  "shadow",
  "superman",
  "batman",
  "michael",
  "jennifer",
  "jordan",
  "harley",
  "ranger",
  "buster",
  "thomas",
  "robert",
  "soccer",
  "hockey",
  "killer",
  "george",
  "charlie",
  "andrew",
  "michelle",
  "jessica",
  "pepper",
  "daniel",
  "access",
  "joshua",
  "maggie",
  "ashley",
  "hunter",
  "summer",
  "tigger",
  "yankees",
  "cowboys",
  "chelsea",
  "liverpool",
  "arsenal",
  "naruto",
  "pokemon",
  "minecraft",
  "fortnite",
  "roblox",
  "snoopy",
  "cookie",
  "chocolate",
  "internet",
  "computer",
  "mustang",
  "corvette",
  "ferrari",
  "porsche",
  "yamaha",
  "samsung",
  "google",
  "facebook",
  "amazon",
  "apple",
  "microsoft",
  "netflix",
  "spotify",
  "youtube",
  "twitter",
  "instagram",
  "changeme",
  "default",
  "guest",
  "root",
  "toor",
  "administrator",
  "test",
  "testing",
  "test123",
  "temp123",
  "secret",
  "private",
  "security",
  "winter",
  "spring",
  "autumn",
  "january",
  "february",
  "monday",
  "friday",
  "mypassword",
  "mypass",
  "pass123",
  "pass1234",
  "password123",
  "password12",
  "password!",
  "p@ssw0rd",
  "p@ssword",
  "passw0rd1",
  "letmein1",
  "welcome1",
  "welcome123",
  "admin123",
  "admin1234",
  "root123",
  "user123",
  "qazwsx",
  "qazwsxedc",
  "zxcvbn",
  "zxcvbnm",
  "asdfgh",
  "asdfghjkl",
  "qwertyuiop",
  "1q2w3e4r",
  "1q2w3e",
  "q1w2e3r4",
  "1qaz2wsx",
  "zaq12wsx",
  "qwe123",
  "123123",
  "1231234",
  "12341234",
  "123321",
  "654321",
  "666666",
  "7777777",
  "888888",
  "121212",
  "112233",
  "000000",
  "987654321",
  "159753",
  "147258369",
  "123qwe",
  "123abc",
  "abc12345",
  "abcd1234",
  "abcdef",
  "abcdefg",
  "aaaaaa",
  "aaaaaaaa",
  "zzzzzz",
  "iloveu",
  "iloveyou1",
  "loveyou",
  "lovely",
  "forever",
  "angel",
  "angels",
  "blessed",
  "family",
  "friends",
  "friend",
  "money",
  "diamond",
  "rainbow",
  "butterfly",
  "flower",
  "orange",
  "purple",
  "yellow",
  "silver",
  "golden",
  "tiger",
  "lion",
  "eagle",
  "falcon",
  "panda",
  "monkey1",
  "dolphin",
  "wizard",
  "ninja",
  "pirate",
  "player",
  "gamer",
  "gaming",
  "legend",
  "champion",
  "winner",
  "newyork",
  "california",
  "texas",
  "london",
  "paris",
  "boston",
  "chicago",
  "seattle",
  "cheese",
  "pizza",
];

const COMMON_SET = new Set(COMMON_PASSWORDS);

const KEYBOARD_ROWS = [
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1234567890",
  "qazwsxedcrfvtgbyhnujmikolp",
];

export type PasswordAssessment = {
  /** 0 (very weak) .. 4 (strong) */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  tone: Tone;
  bits: number;
  guessesLog10: number;
  crackTime: string;
  warnings: string[];
  suggestions: string[];
  length: number;
  charsets: string[];
  common: boolean;
  /** true when the whole password is on the common list (not just a common word plus digits). */
  commonExact: boolean;
};

const LEET: Record<string, string> = {
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
};

export function deLeet(s: string): string {
  return s.replace(/[013457@$!]/g, (c) => LEET[c] ?? c);
}

export function isCommonPassword(pw: string): boolean {
  const lower = pw.toLowerCase();
  if (COMMON_SET.has(lower)) return true;
  if (COMMON_SET.has(deLeet(lower))) return true;
  const stripped = lower.replace(/[\d!@#$%^&*._-]+$/g, "");
  if (
    stripped.length >= 4 &&
    (COMMON_SET.has(stripped) || COMMON_SET.has(deLeet(stripped)))
  )
    return true;
  return false;
}

function charsetInfo(pw: string): { size: number; names: string[] } {
  let size = 0;
  const names: string[] = [];
  if (/[a-z]/.test(pw)) {
    size += 26;
    names.push("lowercase");
  }
  if (/[A-Z]/.test(pw)) {
    size += 26;
    names.push("uppercase");
  }
  if (/\d/.test(pw)) {
    size += 10;
    names.push("numbers");
  }
  if (/[ -/:-@[-`{-~]/.test(pw)) {
    size += 33;
    names.push("symbols");
  }
  if (/[^\x00-\x7f]/.test(pw)) {
    size += 100;
    names.push("unicode");
  }
  return { size: Math.max(size, 1), names };
}

function sequenceLen(s: string, i: number): number {
  // ascending or descending run of consecutive code points (abc, 123, cba)
  if (i + 2 >= s.length) return 0;
  const d = s.charCodeAt(i + 1) - s.charCodeAt(i);
  if (Math.abs(d) !== 1) return 0;
  let j = i + 1;
  while (j + 1 < s.length && s.charCodeAt(j + 1) - s.charCodeAt(j) === d) j++;
  const len = j - i + 1;
  return len >= 3 ? len : 0;
}

function walkLen(lower: string, i: number): number {
  let best = 0;
  for (const row of KEYBOARD_ROWS) {
    for (const r of [row, [...row].reverse().join("")]) {
      let n = 0;
      const start = r.indexOf(lower[i]);
      if (start < 0) continue;
      while (
        i + n < lower.length &&
        start + n < r.length &&
        lower[i + n] === r[start + n]
      )
        n++;
      if (n >= 4 && n > best) best = n;
    }
  }
  return best;
}

export function formatCrackTime(
  guessesLog10: number,
  guessesPerSecond = 1e10
): string {
  const log = guessesLog10 - Math.log10(guessesPerSecond) - Math.log10(2); // on average half the space
  if (log < 0) return "instantly";
  const seconds = 10 ** Math.min(log, 300);
  if (seconds < 1) return "instantly";
  if (seconds < 60) return `about ${Math.round(seconds)} seconds`;
  if (seconds < 3600) return `about ${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `about ${Math.round(seconds / 3600)} hours`;
  if (seconds < 86400 * 30) return `about ${Math.round(seconds / 86400)} days`;
  if (seconds < 86400 * 365)
    return `about ${Math.round(seconds / (86400 * 30))} months`;
  const years = seconds / (86400 * 365);
  if (years < 1000) return `about ${Math.round(years)} years`;
  if (years < 1e6) return `about ${Math.round(years / 1000)} thousand years`;
  if (years < 1e9) return `about ${Math.round(years / 1e6)} million years`;
  if (years < 1e12) return `about ${Math.round(years / 1e9)} billion years`;
  return "longer than the age of the universe";
}

export function assessPassword(pw: string): PasswordAssessment {
  const length = [...pw].length;
  const { size, names } = charsetInfo(pw);
  const warnings: string[] = [];
  const suggestions: string[] = [];
  const common = isCommonPassword(pw);
  const lower = pw.toLowerCase();
  const perChar = Math.log2(size);
  let bits = 0;
  let sawRepeat = false;
  let sawSeq = false;
  let sawWalk = false;
  let sawYear = false;
  let sawWord = false;

  if (length === 0) {
    return {
      score: 0,
      label: "Empty",
      tone: "info",
      bits: 0,
      guessesLog10: 0,
      crackTime: "—",
      warnings: [],
      suggestions: [],
      length: 0,
      charsets: [],
      common: false,
      commonExact: false,
    };
  }

  let i = 0;
  while (i < pw.length) {
    // repeated run
    let r = 1;
    while (i + r < pw.length && pw[i + r] === pw[i]) r++;
    if (r >= 3) {
      bits += perChar + Math.log2(r);
      i += r;
      sawRepeat = true;
      continue;
    }
    const seq = sequenceLen(lower, i);
    if (seq) {
      bits += Math.log2(26) + Math.log2(seq) + 1;
      i += seq;
      sawSeq = true;
      continue;
    }
    const walk = walkLen(lower, i);
    if (walk) {
      bits += Math.log2(40) + Math.log2(walk);
      i += walk;
      sawWalk = true;
      continue;
    }
    const year = /^(19|20)\d\d/.exec(pw.slice(i));
    if (year && !/\d/.test(pw[i + 4] ?? "")) {
      bits += Math.log2(120);
      i += 4;
      sawYear = true;
      continue;
    }
    // dictionary word from the common list (longest first)
    let matched = 0;
    for (let len = Math.min(12, pw.length - i); len >= 4; len--) {
      const chunk = deLeet(lower.slice(i, i + len));
      if (COMMON_SET.has(chunk) || COMMON_SET.has(lower.slice(i, i + len))) {
        matched = len;
        break;
      }
    }
    if (matched) {
      bits += Math.log2(COMMON_PASSWORDS.length) + 1.5;
      i += matched;
      sawWord = true;
      continue;
    }
    bits += perChar;
    i += 1;
  }

  if (common) bits = Math.min(bits, Math.log2(COMMON_PASSWORDS.length) + 4);
  bits = Math.max(1, Math.round(bits * 10) / 10);

  const commonExact = COMMON_SET.has(lower) || COMMON_SET.has(deLeet(lower));
  if (common && commonExact)
    warnings.push(
      "This is one of the most commonly used passwords — attackers try it first."
    );
  else if (common)
    warnings.push(
      "This is a very common word with digits or symbols added — attackers try these patterns first."
    );
  else if (sawWord)
    warnings.push(
      "Contains a very common word or a predictable substitution (like @ for a, 0 for o)."
    );
  if (sawRepeat) warnings.push("Repeated characters are easy to guess.");
  if (sawSeq) warnings.push("Sequences like abc or 1234 are easy to guess.");
  if (sawWalk)
    warnings.push(
      "Keyboard patterns such as qwerty or asdf are easy to guess."
    );
  if (sawYear) warnings.push("Years and dates are easy to guess.");
  if (length < 12)
    suggestions.push("Use at least 12 characters — length matters most.");
  if (names.length < 3 && length < 16)
    suggestions.push(
      "Mix in capitals, numbers and symbols, or just make it longer."
    );
  suggestions.push(
    "A passphrase of 5–6 random words is strong and easier to remember."
  );
  suggestions.push(
    "Use a different password for every account — a password manager helps."
  );

  const score: 0 | 1 | 2 | 3 | 4 =
    bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  const tones: Tone[] = ["bad", "bad", "warn", "good", "good"];
  const guessesLog10 = bits * Math.log10(2);
  return {
    score,
    label: labels[score],
    tone: tones[score],
    bits,
    guessesLog10,
    crackTime: formatCrackTime(guessesLog10),
    warnings,
    suggestions: suggestions.slice(0, 3),
    length,
    charsets: names,
    common,
    commonExact,
  };
}

/* ------------------------------------------------------------------ */
/* Password / passphrase generator                                     */
/* ------------------------------------------------------------------ */

export type RandomFill = (buf: Uint32Array) => Uint32Array;

/** Uniform integer in [0, max) using rejection sampling (no modulo bias). */
export function randomInt(max: number, fill: RandomFill): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32)
    throw new RangeError("max out of range");
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    fill(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

function shuffle<T>(items: T[], fill: RandomFill): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, fill);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type PasswordOptions = {
  length: number;
  lower?: boolean;
  upper?: boolean;
  digits?: boolean;
  symbols?: boolean;
  avoidLookalikes?: boolean;
};

const SETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?",
};
const LOOKALIKES = /[Il1O0o|]/g;

export function passwordCharset(opts: PasswordOptions): string[] {
  const keys = (["lower", "upper", "digits", "symbols"] as const).filter(
    (k) => opts[k] !== false
  );
  const sets = keys.map((k) =>
    opts.avoidLookalikes ? SETS[k].replace(LOOKALIKES, "") : SETS[k]
  );
  return sets.filter((s) => s.length > 0);
}

export function generatePassword(
  opts: PasswordOptions,
  fill: RandomFill
): string {
  const sets = passwordCharset(opts);
  if (sets.length === 0) throw new Error("Choose at least one character type");
  const length = Math.max(sets.length, Math.min(128, Math.floor(opts.length)));
  const all = sets.join("");
  const chars: string[] = sets.map((s) => s[randomInt(s.length, fill)]); // one of each selected type
  while (chars.length < length) chars.push(all[randomInt(all.length, fill)]);
  return shuffle(chars, fill).join("");
}

export function passwordEntropyBits(opts: PasswordOptions): number {
  const size = passwordCharset(opts).join("").length;
  return size <= 1
    ? 0
    : Math.round(Math.max(1, Math.floor(opts.length)) * Math.log2(size) * 10) /
        10;
}

export const WORDLIST: readonly string[] = [
  "able",
  "acorn",
  "actor",
  "adapt",
  "agent",
  "alarm",
  "album",
  "alley",
  "amber",
  "anchor",
  "angle",
  "apple",
  "apron",
  "arbor",
  "arrow",
  "aspen",
  "atlas",
  "attic",
  "autumn",
  "avenue",
  "badge",
  "bagel",
  "baker",
  "balloon",
  "bamboo",
  "banjo",
  "barn",
  "basil",
  "basket",
  "beach",
  "beacon",
  "beaver",
  "bench",
  "berry",
  "bicycle",
  "biscuit",
  "blanket",
  "blossom",
  "boat",
  "bonus",
  "border",
  "bottle",
  "branch",
  "brave",
  "bridge",
  "bright",
  "broom",
  "bubble",
  "bucket",
  "butter",
  "cabin",
  "cactus",
  "camel",
  "camera",
  "canal",
  "candle",
  "canyon",
  "carpet",
  "castle",
  "cedar",
  "cellar",
  "cereal",
  "chair",
  "chalk",
  "cherry",
  "chimney",
  "circle",
  "citrus",
  "clever",
  "cliff",
  "clock",
  "cloud",
  "clover",
  "coast",
  "cobalt",
  "coffee",
  "comet",
  "compass",
  "copper",
  "coral",
  "cotton",
  "cousin",
  "cradle",
  "crayon",
  "creek",
  "cricket",
  "crystal",
  "cuddle",
  "curtain",
  "daisy",
  "dancer",
  "dawn",
  "delta",
  "desert",
  "dinner",
  "dolphin",
  "donkey",
  "dragon",
  "drawer",
  "dream",
  "drift",
  "drum",
  "eagle",
  "earth",
  "easel",
  "ember",
  "engine",
  "fabric",
  "falcon",
  "feather",
  "fence",
  "fennel",
  "ferry",
  "fiddle",
  "field",
  "finch",
  "flame",
  "flannel",
  "flute",
  "forest",
  "fossil",
  "fountain",
  "fox",
  "frost",
  "galaxy",
  "garden",
  "garlic",
  "gentle",
  "ginger",
  "glacier",
  "glider",
  "globe",
  "goose",
  "granite",
  "grape",
  "gravel",
  "guitar",
  "hammer",
  "harbor",
  "harvest",
  "hazel",
  "helmet",
  "heron",
  "hickory",
  "hill",
  "honey",
  "horizon",
  "island",
  "ivory",
  "jacket",
  "jaguar",
  "jelly",
  "jigsaw",
  "journey",
  "jungle",
  "kayak",
  "kettle",
  "kitten",
  "ladder",
  "lagoon",
  "lantern",
  "laurel",
  "lemon",
  "lentil",
  "lizard",
  "lobster",
  "lotus",
  "lumber",
  "magnet",
  "mango",
  "maple",
  "marble",
  "meadow",
  "melon",
  "mirror",
  "mitten",
  "monkey",
  "moose",
  "mosaic",
  "mountain",
  "muffin",
  "mustard",
  "napkin",
  "needle",
  "nectar",
  "nickel",
  "noodle",
  "nutmeg",
  "oasis",
  "ocean",
  "olive",
  "onion",
  "orange",
  "orchid",
  "otter",
  "oyster",
  "paddle",
  "palace",
  "panda",
  "pantry",
  "parade",
  "parrot",
  "pasture",
  "peach",
  "pebble",
  "pencil",
  "pepper",
  "piano",
  "picnic",
  "pillow",
  "pine",
  "planet",
  "plum",
  "pocket",
  "pond",
  "poppy",
  "potato",
  "prairie",
  "pumpkin",
  "puzzle",
  "quartz",
  "quiver",
  "rabbit",
  "radar",
  "raisin",
  "rapid",
  "raven",
  "reef",
  "ribbon",
  "river",
  "rocket",
  "saddle",
  "safari",
  "sailor",
  "salmon",
  "sandal",
  "sapphire",
  "satin",
  "scarf",
  "season",
  "shadow",
  "shelf",
  "shore",
  "silver",
  "singer",
  "sketch",
  "slate",
  "sparrow",
  "spice",
  "spiral",
  "spruce",
  "squirrel",
  "stable",
  "star",
  "stone",
  "storm",
  "summit",
  "sunset",
  "swallow",
  "table",
  "teapot",
  "thimble",
  "thunder",
  "ticket",
  "timber",
  "tiger",
  "tomato",
  "trail",
  "tulip",
  "tunnel",
  "turtle",
  "umbrella",
  "valley",
  "velvet",
  "violet",
  "voyage",
  "walnut",
  "wander",
  "waffle",
  "walrus",
  "willow",
  "window",
  "winter",
  "wizard",
  "wonder",
  "yellow",
  "zebra",
  "zephyr",
  "zigzag",
  "zinc",
  "badger",
  "cannon",
  "dune",
  "flint",
  "goblet",
  "hammock",
  "iris",
  "juniper",
  "kiwi",
  "lilac",
  "mesa",
  "nettle",
  "opal",
  "pearl",
  "quill",
  "robin",
  "sage",
  "tundra",
];

export type PassphraseOptions = {
  words: number;
  separator?: string;
  capitalize?: boolean;
  addNumber?: boolean;
};

export function generatePassphrase(
  opts: PassphraseOptions,
  fill: RandomFill
): string {
  const count = Math.max(3, Math.min(12, Math.floor(opts.words)));
  const sep = opts.separator ?? "-";
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const w = WORDLIST[randomInt(WORDLIST.length, fill)];
    parts.push(opts.capitalize ? w[0].toUpperCase() + w.slice(1) : w);
  }
  if (opts.addNumber) {
    const at = randomInt(count, fill);
    parts[at] = parts[at] + String(randomInt(100, fill));
  }
  return parts.join(sep);
}

export function passphraseEntropyBits(opts: PassphraseOptions): number {
  const count = Math.max(3, Math.min(12, Math.floor(opts.words)));
  let bits = count * Math.log2(WORDLIST.length);
  if (opts.addNumber) bits += Math.log2(count) + Math.log2(100);
  return Math.round(bits * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* HaveIBeenPwned k-anonymity helpers                                  */
/* ------------------------------------------------------------------ */

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha1Hex(
  text: string,
  subtle: Pick<SubtleCrypto, "digest"> = crypto.subtle
): Promise<string> {
  return bytesToHex(
    await subtle.digest("SHA-1", new TextEncoder().encode(text))
  ).toUpperCase();
}

export function splitHash(hexUpper: string): {
  prefix: string;
  suffix: string;
} {
  const h = hexUpper.toUpperCase();
  return { prefix: h.slice(0, 5), suffix: h.slice(5) };
}

/** Returns the breach count for `suffix`, 0 when absent (padding rows count as 0). */
export function parsePwnedRange(body: string, suffix: string): number {
  const want = suffix.toUpperCase();
  for (const line of body.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    if (line.slice(0, i).trim().toUpperCase() === want) {
      const n = parseInt(line.slice(i + 1).trim(), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* Phishing / suspicious link heuristics                               */
/* ------------------------------------------------------------------ */

export type Severity = "high" | "medium" | "low";
export type PhishReason = { severity: Severity; text: string };
export type RiskLevel = "low" | "some" | "suspicious" | "danger";

export type PhishResult = {
  score: number; // 0..100
  level: RiskLevel;
  label: string;
  tone: Tone;
  reasons: PhishReason[];
  hosts: string[];
};

const SEVERITY_POINTS: Record<Severity, number> = {
  high: 38,
  medium: 18,
  low: 8,
};

const BRANDS: Record<string, string[]> = {
  microsoft: [
    "microsoft.com",
    "office.com",
    "live.com",
    "outlook.com",
    "office365.com",
    "microsoftonline.com",
    "sharepoint.com",
    "windows.com",
    "azure.com",
    "bing.com",
    "msn.com",
  ],
  office365: ["office365.com", "office.com", "microsoft.com"],
  outlook: ["outlook.com", "office.com", "live.com", "microsoft.com"],
  google: [
    "google.com",
    "gmail.com",
    "youtube.com",
    "withgoogle.com",
    "googleapis.com",
    "gstatic.com",
    "google.co.uk",
  ],
  gmail: ["gmail.com", "google.com"],
  apple: ["apple.com", "icloud.com"],
  icloud: ["icloud.com", "apple.com"],
  amazon: [
    "amazon.com",
    "amazon.co.uk",
    "amazon.ca",
    "amazon.de",
    "amazonaws.com",
    "amazon.in",
  ],
  paypal: ["paypal.com", "paypal.me"],
  netflix: ["netflix.com"],
  dropbox: ["dropbox.com"],
  docusign: ["docusign.com", "docusign.net"],
  linkedin: ["linkedin.com"],
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  adobe: ["adobe.com"],
  github: ["github.com", "githubusercontent.com"],
  zoom: ["zoom.us"],
  slack: ["slack.com"],
  fedex: ["fedex.com"],
  chase: ["chase.com"],
  wellsfargo: ["wellsfargo.com"],
  bankofamerica: ["bankofamerica.com"],
  dhl: ["dhl.com"],
  ups: ["ups.com"],
  usps: ["usps.com"],
};

const SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "tiny.cc",
  "rb.gy",
  "lnkd.in",
  "t.ly",
  "s.id",
  "v.gd",
  "bl.ink",
]);
const RISKY_TLDS = new Set([
  "zip",
  "mov",
  "top",
  "xyz",
  "click",
  "country",
  "gq",
  "tk",
  "ml",
  "cf",
  "ga",
  "work",
  "support",
  "rest",
  "icu",
  "cam",
  "buzz",
  "link",
  "monster",
  "cyou",
  "sbs",
  "lol",
]);
const SECOND_LEVEL = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "co.nz",
  "co.jp",
  "com.br",
  "co.in",
  "com.mx",
  "co.za",
  "com.sg",
  "com.tr",
]);
const ALL_LEGIT = new Set(Object.values(BRANDS).flat());
const LOGIN_WORDS =
  /(log-?in|sign-?in|verify|secure|account|update|password|wallet|billing|confirm|support|helpdesk|unlock|reset|invoice|payment)/i;

export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const last2 = labels.slice(-2).join(".");
  return SECOND_LEVEL.has(last2) ? labels.slice(-3).join(".") : last2;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

function leetVariants(token: string): string[] {
  const base = token
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/0/g, "o")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s");
  return [base.replace(/1/g, "l"), base.replace(/1/g, "i")];
}

export type ParsedUrl = {
  url: URL;
  rawHost: string;
  assumedScheme: boolean;
};

export function parseUrlLoose(input: string): ParsedUrl | null {
  const trimmed = input
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/[)\].,;:!?'"]+$/, "");
  if (!trimmed || /\s/.test(trimmed)) return null;
  const hasScheme =
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[^/]*:\d+(\/|$)/.test(trimmed);
  const withScheme = hasScheme
    ? trimmed
    : `https://${trimmed.replace(/^\/\//, "")}`;
  try {
    const url = new URL(withScheme);
    const afterScheme = withScheme.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    const rawHost = afterScheme
      .split(/[/?#]/)[0]
      .replace(/^[^@]*@/, "")
      .replace(/:\d+$/, "");
    return { url, rawHost, assumedScheme: !hasScheme };
  } catch {
    return null;
  }
}

function levelFor(score: number): {
  level: RiskLevel;
  label: string;
  tone: Tone;
} {
  if (score < 15)
    return { level: "low", label: "No obvious warning signs", tone: "good" };
  if (score < 40)
    return { level: "some", label: "Some warning signs", tone: "warn" };
  if (score < 70)
    return { level: "suspicious", label: "Looks suspicious", tone: "bad" };
  return { level: "danger", label: "Very likely a scam", tone: "bad" };
}

function finish(reasons: PhishReason[], hosts: string[]): PhishResult {
  const seen = new Set<string>();
  const unique = reasons.filter((r) =>
    seen.has(r.text) ? false : (seen.add(r.text), true)
  );
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  unique.sort((a, b) => order[a.severity] - order[b.severity]);
  const score = Math.min(
    100,
    unique.reduce((n, r) => n + SEVERITY_POINTS[r.severity], 0)
  );
  return { score, ...levelFor(score), reasons: unique, hosts };
}

export function analyzeUrlReasons(input: string): {
  reasons: PhishReason[];
  host: string | null;
} {
  const reasons: PhishReason[] = [];
  const trimmed = input.trim();
  if (/^(javascript|data|vbscript|file):/i.test(trimmed)) {
    return {
      reasons: [
        {
          severity: "high",
          text: "This link type can run code or open local content instead of a normal website.",
        },
      ],
      host: null,
    };
  }
  const parsed = parseUrlLoose(trimmed);
  if (!parsed) return { reasons: [], host: null };
  const { url, rawHost, assumedScheme } = parsed;
  const host = url.hostname.toLowerCase();
  const labels = host.split(".");

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    reasons.push({
      severity: "medium",
      text: `Unusual link type (${url.protocol}) — normal web links start with https://.`,
    });
  } else if (url.protocol === "http:" && !assumedScheme) {
    reasons.push({
      severity: "low",
      text: "Not encrypted (http://). Legitimate sign-in pages use https://.",
    });
  }
  if (
    url.username ||
    /^[^/]*@/.test(trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ""))
  ) {
    reasons.push({
      severity: "high",
      text: `Contains an @ sign — everything before it is ignored; the link really goes to "${host}".`,
    });
  }
  const isIp = isIPv4(host) || host.startsWith("[");
  if (isIp)
    reasons.push({
      severity: "high",
      text: "Uses a raw IP address instead of a website name.",
    });
  if (/[^\x00-\x7f]/.test(rawHost) || /%/.test(rawHost)) {
    reasons.push({
      severity: "high",
      text: "The web address contains look-alike or hidden characters (for example a Cyrillic 'a' that looks like a Latin 'a').",
    });
  }
  if (labels.some((l) => l.startsWith("xn--"))) {
    reasons.push({
      severity: "high",
      text: "Uses punycode (xn--), which is how look-alike international characters are disguised.",
    });
  }

  if (!isIp) {
    const reg = registrableDomain(host);
    const regLabel = reg.split(".")[0];
    const tokens = labels.flatMap((l) => l.split("-")).filter(Boolean);
    const brandKeys = Object.keys(BRANDS);
    let brandHit: string | null = null;
    for (const t of tokens) {
      for (const b of brandKeys) {
        const legit = BRANDS[b].includes(reg);
        if (legit) continue;
        if (t === b && b.length >= 4) {
          brandHit = brandHit ?? `${b}|impersonation|${t}`;
        } else if (t !== b && leetVariants(t).includes(b)) {
          brandHit = `${b}|homoglyph|${t}`;
        } else if (
          b.length >= 6 &&
          t !== b &&
          t.length >= b.length - 1 &&
          t.length <= b.length + 1 &&
          levenshtein(t, b) === 1
        ) {
          brandHit =
            brandHit && brandHit.endsWith("homoglyph")
              ? brandHit
              : `${b}|typo|${t}`;
        }
      }
    }
    if (brandHit) {
      const [b, kind, tok] = brandHit.split("|");
      const name = b.charAt(0).toUpperCase() + b.slice(1);
      if (kind === "impersonation") {
        reasons.push({
          severity: "high",
          text: `Mentions "${name}" but the real site is "${reg}", not ${name}'s own domain.`,
        });
      } else {
        reasons.push({
          severity: "high",
          text: `"${tok}" in the address looks like a misspelling or look-alike of ${name} (swapped letters or numbers).`,
        });
      }
    }
    if (labels.length >= 5)
      reasons.push({
        severity: "medium",
        text: `Very many subdomains (${labels.length} parts) — scammers bury the real domain "${reg}" in a long address.`,
      });
    else if (
      labels.length === 4 &&
      !SECOND_LEVEL.has(labels.slice(-2).join("."))
    )
      reasons.push({
        severity: "low",
        text: `Several subdomains — the page really lives on "${reg}".`,
      });
    if (SHORTENERS.has(host) || SHORTENERS.has(reg))
      reasons.push({
        severity: "medium",
        text: "A link shortener hides where this really goes. Ask the sender for the full link.",
      });
    const tld = labels[labels.length - 1];
    if (RISKY_TLDS.has(tld))
      reasons.push({
        severity: "low",
        text: `The ".${tld}" ending is often used for throwaway or scam sites.`,
      });
    if ((host.match(/-/g) ?? []).length >= 3)
      reasons.push({
        severity: "low",
        text: "Many hyphens in the domain, a common trick in fake sites.",
      });
    if (
      !brandHit &&
      !ALL_LEGIT.has(reg) &&
      LOGIN_WORDS.test(host) &&
      !regLabel.match(/^(login|signin|support)$/)
    ) {
      reasons.push({
        severity: "low",
        text: "The domain itself contains words like login / verify / secure — real companies rarely put them in the domain name.",
      });
    }
  }
  if (url.port && !["80", "443"].includes(url.port))
    reasons.push({
      severity: "low",
      text: `Unusual port number (${url.port}).`,
    });
  if (url.href.length > 200)
    reasons.push({
      severity: "low",
      text: "Very long link — often used to hide the destination.",
    });
  if (
    /[?&](url|redirect|redirect_uri|next|goto|continue|return)=https?%?3?A?/i.test(
      url.search
    )
  ) {
    reasons.push({
      severity: "low",
      text: "Contains a redirect to another site inside the link.",
    });
  }
  return { reasons, host };
}

export function analyzeUrl(input: string): PhishResult {
  const { reasons, host } = analyzeUrlReasons(input);
  return finish(reasons, host ? [host] : []);
}

/* ---- Email text ---- */

const URGENCY =
  /(urgent|immediately|act now|within \d+ ?(hours?|hrs|minutes?)|final (notice|warning)|last chance|expires? (today|soon|in)|account (will be|has been) (suspended|closed|locked|disabled)|suspended|unusual activity|failure to (comply|respond)|avoid (suspension|penalt))/i;
const CREDENTIALS =
  /(verify your (account|identity|password|email)|confirm your (password|identity|account|details)|enter your (password|credentials|login)|update your (payment|billing|bank)|(social security|ssn)|one[- ]time (code|passcode)|2fa code|verification code|bank (account )?details|credit card number|reset your password (now|immediately))/i;
const MONEY =
  /(gift ?cards?|wire transfer|bitcoin|crypto(currency)?|western union|itunes card|pay (an? )?invoice|overdue invoice|refund (is )?(waiting|pending)|you (have )?won|lottery|inheritance)/i;
const GENERIC_GREETING =
  /^(\s*(subject:.*\n)?\s*)?(dear (customer|user|client|member|account holder|sir|madam|valued)|hello (customer|user)|valued customer)/im;
const RISKY_ATTACHMENT =
  /\b[\w-]+\.(exe|scr|js|jse|vbs|bat|cmd|msi|iso|img|lnk|hta|html?|docm|xlsm|pptm|zip|rar)\b|enable (macros|content)/i;

const LINK_RE = /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi;
const ANCHOR_RE =
  /<a\b[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function looksLikeUrlText(s: string): string | null {
  const t = s.trim();
  if (/\s/.test(t)) return null;
  const m = /^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]|$)/i.exec(
    t
  );
  return m ? m[1].toLowerCase() : null;
}

export type ExtractedLink = { href: string; text: string | null };

export function extractLinks(text: string): ExtractedLink[] {
  const out: ExtractedLink[] = [];
  const seenHref = new Set<string>();
  const push = (href: string, label: string | null) => {
    const clean = href.trim().replace(/&amp;/g, "&");
    if (!clean) return;
    const key = `${clean}|${label ?? ""}`;
    if (seenHref.has(key)) return;
    seenHref.add(key);
    out.push({ href: clean, text: label });
  };
  for (const m of text.matchAll(ANCHOR_RE))
    push(m[1] ?? m[2] ?? m[3] ?? "", stripTags(m[4] ?? ""));
  for (const m of text.matchAll(MD_LINK_RE)) push(m[2], m[1]);
  const consumed = text.replace(ANCHOR_RE, " ").replace(MD_LINK_RE, " ");
  for (const m of consumed.matchAll(LINK_RE))
    push(m[0].replace(/[.,;:!?]+$/, ""), null);
  return out.slice(0, 25);
}

export function isProbablyUrl(input: string): boolean {
  const t = input.trim();
  if (!t || /\s/.test(t) || t.includes("<a ")) return false;
  return (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ||
    /^(javascript|data):/i.test(t) ||
    /^(www\.)?([a-z0-9-]+\.)+[a-z]{2,}([/:?#]|$)/i.test(t) ||
    /^\d{1,3}(\.\d{1,3}){3}/.test(t)
  );
}

export function analyzeEmailText(text: string): PhishResult {
  const reasons: PhishReason[] = [];
  const hosts: string[] = [];
  const links = extractLinks(text);

  const maxLinks = 8;
  for (const link of links.slice(0, maxLinks)) {
    const { reasons: r, host } = analyzeUrlReasons(link.href);
    if (host && !hosts.includes(host)) hosts.push(host);
    for (const x of r)
      reasons.push({ ...x, text: host ? `${host}: ${x.text}` : x.text });
    if (link.text) {
      const shown = looksLikeUrlText(link.text);
      const parsed = parseUrlLoose(link.href);
      if (
        shown &&
        parsed &&
        registrableDomain(shown) !== registrableDomain(parsed.url.hostname)
      ) {
        reasons.push({
          severity: "high",
          text: `Link text says "${shown}" but it actually goes to "${parsed.url.hostname}".`,
        });
      }
    }
  }
  if (links.length > maxLinks)
    reasons.push({
      severity: "low",
      text: `Contains ${links.length} links; only the first ${maxLinks} were checked.`,
    });

  const from =
    /^\s*from:\s*(?:"?([^"<\n]*?)"?\s*)?<?([^\s<>@]+@([a-z0-9.-]+\.[a-z]{2,}))>?/im.exec(
      text
    );
  if (from) {
    const display = (from[1] ?? "").toLowerCase();
    const domain = from[3].toLowerCase();
    const reg = registrableDomain(domain);
    for (const [brand, legit] of Object.entries(BRANDS)) {
      if (
        brand.length >= 4 &&
        display.includes(brand) &&
        !legit.includes(reg)
      ) {
        reasons.push({
          severity: "high",
          text: `Sender name says "${brand}" but the email address comes from "${domain}".`,
        });
        break;
      }
    }
  }

  if (URGENCY.test(text))
    reasons.push({
      severity: "medium",
      text: "Uses urgent or threatening language to rush you (e.g. 'act now', 'account suspended').",
    });
  if (CREDENTIALS.test(text))
    reasons.push({
      severity: "high",
      text: "Asks you to verify, confirm or send sensitive details such as a password, code or bank information.",
    });
  if (MONEY.test(text))
    reasons.push({
      severity: "medium",
      text: "Mentions gift cards, wire transfers, crypto, prizes or surprise invoices — common scam hooks.",
    });
  if (GENERIC_GREETING.test(text))
    reasons.push({
      severity: "low",
      text: "Generic greeting like 'Dear customer' instead of your name.",
    });
  if (RISKY_ATTACHMENT.test(text))
    reasons.push({
      severity: "medium",
      text: "Mentions a risky attachment type (or asks you to enable macros).",
    });

  return finish(reasons, hosts);
}

export function analyzeInput(input: string): {
  kind: "url" | "email";
  result: PhishResult;
} {
  if (isProbablyUrl(input)) return { kind: "url", result: analyzeUrl(input) };
  return { kind: "email", result: analyzeEmailText(input) };
}

/* ------------------------------------------------------------------ */
/* Wi-Fi & router guided diagnosis                                     */
/* ------------------------------------------------------------------ */

export type WifiAnswers = {
  scope: "all" | "one" | "unsure";
  distance: "near" | "far" | "unsure";
  vpn: "on" | "off" | "unsure";
  mobile: "works" | "also-bad" | "cant-test";
  sites: "all" | "some";
};

export type WifiProbe = {
  online: boolean;
  medianMs: number | null;
  lossPct: number;
  jitterMs: number | null;
  externalOk: boolean | null;
};

export type WifiCauseId = "router" | "isp" | "device" | "vpn" | "dns";

export type WifiCause = {
  id: WifiCauseId;
  title: string;
  score: number;
  likelihood: "Most likely" | "Possible" | "Unlikely";
  why: string[];
  steps: string[];
  guides: { id: string; label: string }[];
};

/** Guide ids that exist in lib/issues.ts. */
export const WIFI_GUIDES = {
  wifi: { id: "wifi-disconnecting", label: "Wi-Fi keeps disconnecting" },
  none: { id: "no-internet", label: "No internet connection" },
  slow: { id: "slow-internet", label: "Slow internet" },
  vpn: { id: "vpn-problem", label: "VPN problem" },
  cable: { id: "ethernet-not-working", label: "Wired connection not working" },
} as const;

export function diagnoseWifi(a: WifiAnswers, p: WifiProbe): WifiCause[] {
  const why: Record<WifiCauseId, string[]> = {
    router: [],
    isp: [],
    device: [],
    vpn: [],
    dns: [],
  };
  const score: Record<WifiCauseId, number> = {
    router: 10,
    isp: 10,
    device: 10,
    vpn: 5,
    dns: 5,
  };
  const bump = (id: WifiCauseId, n: number, reason: string) => {
    score[id] += n;
    why[id].push(reason);
  };
  const flaky =
    p.lossPct >= 5 || (p.jitterMs ?? 0) > 40 || (p.medianMs ?? 0) > 250;

  if (a.scope === "all") {
    bump(
      "router",
      25,
      "Every device is affected, so the problem is shared — router, modem or internet line."
    );
    bump("isp", 20, "Every device is affected.");
    score.device -= 10;
  } else if (a.scope === "one") {
    bump("device", 35, "Only this device has trouble while others are fine.");
    score.router -= 10;
    score.isp -= 15;
  }
  if (a.distance === "far")
    bump(
      "router",
      20,
      "Weak signal is likely far from the router or through walls."
    );
  if (a.distance === "near") {
    score.router -= 5;
    if (a.scope === "all")
      bump(
        "isp",
        10,
        "Close to the router, so signal strength is less likely."
      );
  }
  if (a.vpn === "on")
    bump(
      "vpn",
      50,
      "A VPN is on — it adds delay and can block or drop traffic."
    );
  if (a.mobile === "works") {
    bump(
      "router",
      15,
      "Mobile data works, so the internet is fine away from your Wi-Fi."
    );
    bump("device", 5, "Mobile data works.");
    score.isp -= 15;
  } else if (a.mobile === "also-bad") {
    bump(
      "isp",
      25,
      "Mobile data is also bad — more likely an area/provider problem."
    );
    score.router -= 10;
    score.device -= 5;
  }
  if (a.sites === "some")
    bump(
      "dns",
      45,
      "Only some websites fail — that pattern fits DNS or a blocked site."
    );
  if (!p.online) {
    bump("router", 20, "This page could not reach the site at all.");
    bump("isp", 10, "This page could not reach the site at all.");
  } else if (flaky) {
    const detail =
      p.lossPct >= 5
        ? `${p.lossPct}% of probes were lost`
        : `latency was uneven (${fmtMs(p.medianMs)}, jitter ${fmtMs(p.jitterMs)})`;
    bump("router", 15, `The quick test showed unsteady connection: ${detail}.`);
    bump("isp", 5, "Unsteady connection in the quick test.");
  } else {
    bump(
      "dns",
      5,
      "The quick test was healthy, so the line itself is working."
    );
    score.router -= 10;
    score.isp -= 10;
  }
  if (p.externalOk === false && p.online)
    bump("dns", 10, "A second public endpoint failed while this site worked.");

  const info: Record<
    WifiCauseId,
    { title: string; steps: string[]; guides: WifiCause["guides"] }
  > = {
    router: {
      title: "Router or Wi-Fi signal",
      steps: [
        "Restart the router: unplug for 30 seconds, plug back in, wait 2 minutes.",
        "Move closer or remove obstacles; try the 5 GHz network for speed or 2.4 GHz for range.",
        "Try a network cable to see if the wired connection is steady.",
      ],
      guides: [WIFI_GUIDES.wifi, WIFI_GUIDES.cable],
    },
    isp: {
      title: "Internet provider or outage",
      steps: [
        "Check your provider's outage page or app on mobile data.",
        "Restart both modem and router, then wait for the lights to settle.",
        "If it stays bad for an hour, contact your provider with the results below.",
      ],
      guides: [WIFI_GUIDES.none, WIFI_GUIDES.slow],
    },
    device: {
      title: "This device",
      steps: [
        "Turn Wi-Fi off and on, or forget the network and rejoin it.",
        "Restart the device and install pending updates.",
        "Test another browser or app to rule out a single program.",
      ],
      guides: [WIFI_GUIDES.wifi, WIFI_GUIDES.none],
    },
    vpn: {
      title: "VPN or proxy",
      steps: [
        "Disconnect the VPN and test again.",
        "If it works without the VPN, try another VPN server or protocol.",
        "Ask IT if your company VPN has known issues.",
      ],
      guides: [WIFI_GUIDES.vpn],
    },
    dns: {
      title: "DNS or a blocked website",
      steps: [
        "Run the DNS check tool for the site that fails.",
        "Flush your DNS cache, or restart the device.",
        "Try the site on mobile data — if it works there, your network's DNS or filter is the cause.",
      ],
      guides: [WIFI_GUIDES.none],
    },
  };

  const ranked = (Object.keys(info) as WifiCauseId[])
    .map((id) => ({
      id,
      ...info[id],
      score: Math.max(0, Math.min(100, score[id])),
      why: why[id],
    }))
    .sort((x, y) => y.score - x.score);
  const top = ranked[0].score;
  return ranked.map((c, i) => ({
    ...c,
    likelihood:
      i === 0 && top >= 25
        ? "Most likely"
        : c.score >= 25
          ? "Possible"
          : "Unlikely",
    why: c.why.length ? c.why : ["Nothing you told us points here."],
  }));
}
