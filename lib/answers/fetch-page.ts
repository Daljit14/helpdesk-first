import { answerTierFor, isRedditHost } from "./tiers";
import { extractPageText, htmlToText } from "./html";
import { screenSourceText } from "./screen";
import type { SourceTier } from "./types";
import { validateStatusBaseUrl } from "@/lib/service-health/url";

const PAGE_LIMIT = 1024 * 1024;
const ROBOTS_LIMIT = 64 * 1024;
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = "HelpDeskFirstAnswerEngine/1.0";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type RobotsRule = { allow: boolean; path: string };
type RobotsGroup = { agents: string[]; rules: RobotsRule[] };
type RobotsResponse = { status: number; text: string };
type CachedRobots = { expiresAt: number; rules: RobotsRule[] | null };

export type FetchPageReason =
  | "blocked_host"
  | "tier_not_fetchable"
  | "invalid_url"
  | "robots_disallowed"
  | "too_large"
  | "bad_content_type"
  | "http_error"
  | "timeout"
  | "redirect_rejected";

export type FetchPageResult =
  | { ok: true; text: string; withheld: number }
  | { ok: false; reason: FetchPageReason };

export type RobotsFetcher = (
  url: URL,
  signal: AbortSignal,
  fetchImpl: typeof fetch
) => Promise<RobotsResponse | null>;

const robotsCache = new Map<string, CachedRobots>();

function isFetchableTier(
  tier: SourceTier | null
): tier is Extract<SourceTier, "org_approved" | "vendor" | "reference"> {
  return tier === "org_approved" || tier === "vendor" || tier === "reference";
}

function requestSignal(signal: AbortSignal, timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout !== "function") return signal;
  const timeout = AbortSignal.timeout(timeoutMs);
  return typeof AbortSignal.any === "function"
    ? AbortSignal.any([signal, timeout])
    : timeout;
}

async function readLimited(
  response: Response,
  maxBytes: number
): Promise<string | null> {
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) return null;
  if (!response.body) {
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength <= maxBytes ? text : null;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let sawRule = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#", 1)[0].trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const directive = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (directive === "user-agent") {
      if (!current || sawRule) {
        current = { agents: [], rules: [] };
        groups.push(current);
        sawRule = false;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if ((directive === "allow" || directive === "disallow") && current) {
      if (!value) continue;
      current.rules.push({ allow: directive === "allow", path: value });
      sawRule = true;
    }
  }
  return groups;
}

function rulesFor(groups: RobotsGroup[]): RobotsRule[] {
  const specific = groups
    .filter((group) =>
      group.agents.some((agent) => agent === "helpdeskfirstanswerengine")
    )
    .flatMap((group) => group.rules);
  if (specific.length > 0) return specific;
  return groups
    .filter((group) => group.agents.includes("*"))
    .flatMap((group) => group.rules);
}

function robotsPattern(path: string): RegExp {
  const endAnchored = path.endsWith("$");
  const rulePath = endAnchored ? path.slice(0, -1) : path;
  const pattern = rulePath
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${endAnchored ? "$" : ""}`);
}

function robotsAllows(rules: RobotsRule[], path: string): boolean {
  const matched = rules
    .filter((rule) => robotsPattern(rule.path).test(path))
    .sort(
      (left, right) =>
        right.path.length - left.path.length ||
        Number(right.allow) - Number(left.allow)
    );
  if (matched.length === 0) return true;
  return matched[0].allow;
}

async function defaultRobotsFetcher(
  url: URL,
  signal: AbortSignal,
  fetchImpl: typeof fetch
): Promise<RobotsResponse | null> {
  const safeOrigin = validateStatusBaseUrl(url.toString());
  if (!safeOrigin || isRedditHost(url.hostname)) return null;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: requestSignal(signal, 3000),
      headers: { "user-agent": USER_AGENT, accept: "text/plain" },
    });
    if (response.status >= 400 && response.status < 500)
      return { status: response.status, text: "" };
    if (response.status !== 200) return null;
    const text = await readLimited(response, ROBOTS_LIMIT);
    return text === null ? null : { status: response.status, text };
  } catch {
    return null;
  }
}

async function getRobotsRules(
  url: URL,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
  robots?: RobotsFetcher
): Promise<RobotsRule[] | null> {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const cached = robotsCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.rules;

  const robotsUrl = new URL("/robots.txt", url.origin);
  const result = await (robots ?? defaultRobotsFetcher)(
    robotsUrl,
    signal,
    fetchImpl
  );
  if (!result || (result.status >= 500 && result.status < 600)) {
    robotsCache.set(hostname, {
      expiresAt: Date.now() + ROBOTS_TTL_MS,
      rules: null,
    });
    return null;
  }
  if (result.status >= 400 && result.status < 500) {
    robotsCache.set(hostname, {
      expiresAt: Date.now() + ROBOTS_TTL_MS,
      rules: [],
    });
    return [];
  }
  if (result.status !== 200 || result.text.length > ROBOTS_LIMIT) return null;
  const rules = rulesFor(parseRobots(result.text));
  robotsCache.set(hostname, {
    expiresAt: Date.now() + ROBOTS_TTL_MS,
    rules,
  });
  return rules;
}

function validatedTier(
  url: URL,
  orgDomains: readonly string[]
): SourceTier | null {
  if (!validateStatusBaseUrl(url.toString())) return null;
  return answerTierFor(url.toString(), orgDomains);
}

export async function fetchPage(
  rawUrl: string,
  options: {
    tier: SourceTier;
    signal: AbortSignal;
    fetchImpl?: typeof fetch;
    robots?: RobotsFetcher;
    orgDomains?: readonly string[];
  }
): Promise<FetchPageResult> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (isRedditHost(current.hostname))
    return { ok: false, reason: "blocked_host" };
  if (!validateStatusBaseUrl(current.toString()))
    return { ok: false, reason: "invalid_url" };
  const orgDomains = options.orgDomains ?? [];
  let currentTier = validatedTier(current, orgDomains);
  if (!isFetchableTier(currentTier) || currentTier !== options.tier)
    return { ok: false, reason: "tier_not_fetchable" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const rules = await getRobotsRules(
    current,
    options.signal,
    fetchImpl,
    options.robots
  );
  if (!rules || !robotsAllows(rules, `${current.pathname}${current.search}`))
    return { ok: false, reason: "robots_disallowed" };

  for (let redirects = 0; redirects <= 2; redirects += 1) {
    if (isRedditHost(current.hostname))
      return { ok: false, reason: "blocked_host" };
    if (!validateStatusBaseUrl(current.toString()))
      return { ok: false, reason: "redirect_rejected" };
    const nextTier = validatedTier(current, orgDomains);
    if (
      !isFetchableTier(nextTier) ||
      !currentTier ||
      tierRank(nextTier) > tierRank(currentTier)
    )
      return { ok: false, reason: "redirect_rejected" };
    currentTier = nextTier;

    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: requestSignal(options.signal, 5000),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html, text/plain;q=0.9",
        },
      });
    } catch {
      return { ok: false, reason: "timeout" };
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirects === 2) return { ok: false, reason: "redirect_rejected" };
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: "redirect_rejected" };
      try {
        const target = new URL(location, current);
        if (isRedditHost(target.hostname))
          return { ok: false, reason: "blocked_host" };
        if (!validateStatusBaseUrl(target.toString()))
          return { ok: false, reason: "redirect_rejected" };
        const targetTier = validatedTier(target, orgDomains);
        if (
          !isFetchableTier(targetTier) ||
          !currentTier ||
          tierRank(targetTier) > tierRank(currentTier)
        )
          return { ok: false, reason: "redirect_rejected" };
        const targetRules = await getRobotsRules(
          target,
          options.signal,
          fetchImpl,
          options.robots
        );
        if (
          !targetRules ||
          !robotsAllows(targetRules, `${target.pathname}${target.search}`)
        )
          return { ok: false, reason: "redirect_rejected" };
        current = target;
        currentTier = targetTier;
        continue;
      } catch {
        return { ok: false, reason: "redirect_rejected" };
      }
    }
    if (!response.ok) return { ok: false, reason: "http_error" };
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      !contentType.startsWith("text/html") &&
      !contentType.startsWith("text/plain")
    )
      return { ok: false, reason: "bad_content_type" };
    let body: string | null;
    try {
      body = await readLimited(response, PAGE_LIMIT);
    } catch {
      return { ok: false, reason: "http_error" };
    }
    if (body === null) return { ok: false, reason: "too_large" };
    const text = contentType.startsWith("text/html")
      ? extractPageText(body)
      : htmlToText(body.replace(/\r\n?/g, "\n")).slice(0, 6000);
    const screened = screenSourceText(text);
    return { ok: true, ...screened };
  }
  return { ok: false, reason: "redirect_rejected" };
}

function tierRank(tier: SourceTier): number {
  return {
    org_approved: 0,
    vendor: 1,
    reference: 2,
    qa_community: 3,
    community: 4,
  }[tier];
}
