import type { AgentEvent } from "./types";
import { sanitizeForUser } from "./untrusted";
import {
  luhnValid,
  SECRET_PATTERNS,
  type SecretKind,
} from "@/lib/security/secret-patterns";

export type OutputRedactionKind =
  | SecretKind
  | "email"
  | "ip_address"
  | "mac_address"
  | "windows_sid"
  | "hostname";

export type OutputRedaction = { kind: OutputRedactionKind };

export type OutputGuardContext = {
  requesterIdentifiers: readonly string[];
  redactions?: OutputRedaction[];
};

const SECRET_LABEL = "[removed: credential]";
const PERSONAL_LABEL = "[removed: another person's details]";
const NETWORK_LABEL = "[removed: device or network detail]";

const SECRET_OUTPUT_LABELS: Record<SecretKind, string> = {
  token: SECRET_LABEL,
  api_key: SECRET_LABEL,
  jwt: SECRET_LABEL,
  password: SECRET_LABEL,
  mfa_code: SECRET_LABEL,
  card: SECRET_LABEL,
  aws_key: SECRET_LABEL,
  private_key: SECRET_LABEL,
};

const IP_ADDRESS =
  /(?<!\.\d)\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b(?!\.\d)/g;
const IPV6_CANDIDATE = /(?<![0-9a-f:])[0-9a-f:]*::[0-9a-f:]*(?![0-9a-f:])/gi;
const IPV6_FULL =
  /(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}(?![0-9a-f:])/gi;
const MAC_ADDRESS = /\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b/g;
const WINDOWS_SID = /\bS-1-\d+(?:-\d+){1,14}\b/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const UNC_HOSTNAME = /\\\\[A-Za-z0-9-]+/g;
const INTERNAL_FQDN =
  /\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:local|lan|internal|intranet|corp|home\.arpa|ad)\b/gi;
const WINDOWS_HOSTNAME = /\b(?:DESKTOP|LAPTOP|WIN|PC)-[A-Z0-9]{5,}\b/g;

function requesterIdentifiers(ctx: OutputGuardContext): Set<string> {
  return new Set(
    ctx.requesterIdentifiers.flatMap((value) => {
      const identifier = value.toLowerCase();
      return [identifier, identifier.replace(/^\\\\/, "")];
    })
  );
}

function isRequesterIdentifier(
  value: string,
  identifiers: ReadonlySet<string>
): boolean {
  const lower = value.toLowerCase();
  return identifiers.has(lower) || identifiers.has(lower.replace(/^\\\\/, ""));
}

function addRedaction(
  redactions: OutputRedaction[],
  kind: OutputRedactionKind
): string {
  redactions.push({ kind });
  return kind in SECRET_OUTPUT_LABELS
    ? SECRET_OUTPUT_LABELS[kind as SecretKind]
    : kind === "email"
      ? PERSONAL_LABEL
      : NETWORK_LABEL;
}

function isValidIpv6(value: string): boolean {
  if (!value.includes("::") || value.indexOf("::") !== value.lastIndexOf("::"))
    return false;
  const groups = value.split(":").filter(Boolean);
  return (
    groups.length > 0 &&
    groups.length < 8 &&
    groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))
  );
}

function replaceMatches(
  text: string,
  pattern: RegExp,
  kind: OutputRedactionKind,
  redactions: OutputRedaction[],
  shouldReplace: (match: string, index: number) => boolean = () => true
): string {
  return text.replace(pattern, (match, offset: number) => {
    if (!shouldReplace(match, offset)) return match;
    return addRedaction(redactions, kind);
  });
}

function replaceSecret(
  text: string,
  pattern: RegExp,
  kind: SecretKind,
  redactions: OutputRedaction[]
): string {
  return text.replace(pattern, (match, offset: number) => {
    if (kind === "card") {
      const digits = match.replace(/[ -]/g, "");
      const previous = text[offset - 1] ?? "";
      const next = text[offset + match.length] ?? "";
      if (
        !luhnValid(digits) ||
        /[0-9a-f-]/i.test(previous) ||
        /[0-9a-f-]/i.test(next)
      )
        return match;
    }
    if (kind === "password" || kind === "mfa_code") {
      const separator = /\s*(?:is|was|[:=])\s*/i.exec(match);
      if (!separator) return match;
      const valueStart = separator.index + separator[0].length;
      const value = match.slice(valueStart);
      if (value.trimStart().startsWith("[removed: credential]")) return match;
      const separatorText = separator[0].trim().toLowerCase();
      if (separatorText === "is" || separatorText === "was") {
        const firstWord = /^\S+/.exec(value)?.[0] ?? "";
        if (!/[^a-z]/i.test(firstWord)) return match;
      }
      return `${match.slice(0, separator.index + separator[0].length)}${addRedaction(redactions, kind)}`;
    }
    return addRedaction(redactions, kind);
  });
}

export function guardAgentOutput(
  text: string,
  ctx: OutputGuardContext
): { text: string; redactions: OutputRedaction[] } {
  let guarded = text;
  const redactions: OutputRedaction[] = [];
  const identifiers = requesterIdentifiers(ctx);
  for (const secret of SECRET_PATTERNS) {
    guarded = replaceSecret(guarded, secret.pattern, secret.kind, redactions);
  }
  guarded = replaceMatches(
    guarded,
    EMAIL,
    "email",
    redactions,
    (match) => !isRequesterIdentifier(match, identifiers)
  );
  guarded = replaceMatches(guarded, MAC_ADDRESS, "mac_address", redactions);
  guarded = replaceMatches(guarded, IPV6_FULL, "ip_address", redactions);
  guarded = replaceMatches(
    guarded,
    IPV6_CANDIDATE,
    "ip_address",
    redactions,
    isValidIpv6
  );
  guarded = replaceMatches(guarded, IP_ADDRESS, "ip_address", redactions);
  guarded = replaceMatches(guarded, WINDOWS_SID, "windows_sid", redactions);
  for (const hostnamePattern of [
    UNC_HOSTNAME,
    INTERNAL_FQDN,
    WINDOWS_HOSTNAME,
  ]) {
    guarded = replaceMatches(
      guarded,
      hostnamePattern,
      "hostname",
      redactions,
      (match) => !isRequesterIdentifier(match, identifiers)
    );
  }
  return { text: guarded, redactions };
}

export function toUserText(text: string, ctx: OutputGuardContext): string {
  const guarded = guardAgentOutput(sanitizeForUser(text), ctx);
  ctx.redactions?.push(...guarded.redactions);
  return guarded.text;
}

export function guardAgentEvent(
  event: AgentEvent,
  ctx: OutputGuardContext
): AgentEvent {
  switch (event.type) {
    case "session":
    case "tool_started":
    case "session_consent":
    case "consent_declined":
    case "escalated":
    case "halted":
      return { ...event };
    case "thinking_summary":
    case "action_proposed":
    case "action_executing":
    case "verification_result":
    case "confirm_required":
    case "resolved":
    case "final_answer":
      return { ...event, text: toUserText(event.text, ctx) };
    case "tool_result_summary":
      return { ...event, summary: toUserText(event.summary, ctx) };
    case "screenshot_received":
      return { ...event, summary: toUserText(event.summary, ctx) };
    case "service_incident":
      return {
        ...event,
        incidents: event.incidents.map((incident) => ({
          ...incident,
          service: toUserText(incident.service, ctx),
          title: toUserText(incident.title, ctx),
        })),
      };
    case "user_step":
      return {
        ...event,
        card: {
          ...event.card,
          instruction: toUserText(event.card.instruction, ctx),
          why: toUserText(event.card.why, ctx),
          source: {
            ...event.card.source,
            title: toUserText(event.card.source.title, ctx),
          },
        },
      };
    case "consent_required":
      return {
        ...event,
        card: {
          ...event.card,
          title: toUserText(event.card.title, ctx),
          whatHappens: toUserText(event.card.whatHappens, ctx),
          target: {
            ...event.card.target,
            label: toUserText(event.card.target.label, ctx),
          },
        },
      };
    case "session_consent_offer":
      return {
        ...event,
        card: {
          ...event.card,
          title: toUserText(event.card.title, ctx),
          capabilities: event.card.capabilities.map((capability) => ({
            ...capability,
            title: toUserText(capability.title, ctx),
            whatHappens: toUserText(capability.whatHappens, ctx),
          })),
        },
      };
    case "error":
      return { ...event, message: toUserText(event.message, ctx) };
    default: {
      const neverEvent: never = event;
      return neverEvent;
    }
  }
}

const DROPPED_TOOL_KEYS = new Set([
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "secret",
  "clientsecret",
  "password",
  "passcode",
  "sessionid",
  "cookie",
  "cookies",
  "sid",
  "upn",
  "userprincipalname",
  "email",
  "emails",
  "mail",
  "deviceid",
  "directoryuserid",
  "userid",
  "requesterid",
]);

const COUNTED_TOOL_KEYS = new Set([
  "ip",
  "ips",
  "ipaddress",
  "ipaddresses",
  "ipv4",
  "ipv6",
  "macaddress",
  "macaddresses",
  "dnsservers",
]);

function normalizeToolKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function minimize(
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= 6) return "[truncated]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    const minimized = value
      .slice(0, 50)
      .map((item) => minimize(item, depth + 1, seen));
    seen.delete(value);
    return minimized;
  }
  const minimized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizeToolKey(key);
    if (DROPPED_TOOL_KEYS.has(normalizedKey)) continue;
    if (COUNTED_TOOL_KEYS.has(normalizedKey)) {
      minimized[`${key}Count`] =
        item === null ? 0 : Array.isArray(item) ? item.length : 1;
      continue;
    }
    minimized[key] = minimize(item, depth + 1, seen);
  }
  seen.delete(value);
  return minimized;
}

export function minimizeToolOutput(value: unknown): unknown {
  return minimize(value, 0, new WeakSet());
}

export const NO_REQUESTER: OutputGuardContext = Object.freeze({
  requesterIdentifiers: Object.freeze([]),
});
