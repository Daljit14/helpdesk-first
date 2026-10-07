export type TripwireKind =
  | "other_user_target"
  | "weaken_security"
  | "bypass_mfa"
  | "impersonation"
  | "urgency_sensitive"
  | "secret_request"
  | "repeated_identity_failure"
  | "injection_in_tool_output"
  | "model_proposed_denylisted"
  | "instruction_content";

export const OTHER_USER_TARGET =
  /for (my|a) (colleague|boss|manager|coworker)/i;

const patterns: Array<[TripwireKind, RegExp]> = [
  ["other_user_target", OTHER_USER_TARGET],
  [
    "weaken_security",
    /(disable|turn off|stop) (defender|antivirus|firewall|edr|vpn)/i,
  ],
  ["bypass_mfa", /(bypass|skip|reset).{0,20}(mfa|2fa|verification)/i],
  ["impersonation", /this is (the )?(it|helpdesk|ceo|cto|manager)/i],
  [
    "urgency_sensitive",
    /(urgent|asap|immediately).{0,80}(password|mfa|admin|unlock)/i,
  ],
  [
    "secret_request",
    /(reveal|show|give me).{0,30}(token|secret|api key|password)/i,
  ],
];

export function detectTripwire(userMessage: string): TripwireKind | null {
  return patterns.find(([, pattern]) => pattern.test(userMessage))?.[0] ?? null;
}

export type InstructionContentKind =
  | "ignore_previous"
  | "role_play"
  | "tool_call_shape"
  | "role_marker"
  | "hidden_text";

const ignorePreviousPattern =
  /\b(?:ignore|disregard|forget)\b[^.\n]{0,25}\b(?:previous|prior|above|earlier|all)\b[^.\n]{0,25}\b(?:instructions?|rules?|prompts?|messages?)\b/i;
const rolePlayPattern =
  /\byou are now (?:an?|the|my) (?:\w+ ){0,2}(?:assistant|admin|administrator|agent|ai|bot|developer|operator)\b|\bact as (?:an?|the|my)? ?(?:\w+ ){0,2}(?:assistant|admin|administrator|agent|ai|bot|developer|operator|system)\b|\bfrom now on,? you (?:are|will act|must ignore|will ignore|must obey|will obey|have no)\b|\bpretend (?:to be|you are)\b|\brole-?play\b/i;
const hiddenTextPattern =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u{E0000}-\u{E007F}]/u;
const roleMarkerPattern =
  /(?:^\s*(?:system|assistant|developer)\s*:|<\|im_start\|>|\[INST\])/im;
const toolCallTextPattern =
  /<\s*(?:tool_use|function_calls|invoke)\b|\bpropose_action\s*\{|"type"\s*:\s*"tool_use"/i;

function isToolCallObject(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (Array.isArray(value))
    return value.some((item) => isToolCallObject(item, depth + 1));
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).map((key) => key.toLowerCase());
  if (
    value.type === "tool_use" ||
    (keys.some((key) => ["name", "type", "tool", "function"].includes(key)) &&
      keys.some((key) =>
        ["input", "arguments", "parameters", "params"].includes(key)
      ))
  )
    return true;
  return Object.values(value).some((item) => isToolCallObject(item, depth + 1));
}

function containsToolCallJson(text: string): boolean {
  const candidates = [text];
  let quote = "";
  let escaped = false;
  let depth = 0;
  let start = -1;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0)
        candidates.push(text.slice(start, index + 1));
    }
  }
  for (const candidate of candidates) {
    try {
      let parsed: unknown = JSON.parse(candidate);
      for (let level = 0; level < 2; level += 1) {
        if (isToolCallObject(parsed)) return true;
        if (typeof parsed !== "string") break;
        parsed = JSON.parse(parsed);
      }
    } catch {
      continue;
    }
  }
  return false;
}

export function detectInstructionContent(
  text: string
): InstructionContentKind | null {
  if (hiddenTextPattern.test(text)) return "hidden_text";
  const normalized = text.normalize("NFKC");
  if (ignorePreviousPattern.test(normalized)) return "ignore_previous";
  if (rolePlayPattern.test(normalized)) return "role_play";
  if (toolCallTextPattern.test(normalized) || containsToolCallJson(normalized))
    return "tool_call_shape";
  if (roleMarkerPattern.test(normalized)) return "role_marker";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
