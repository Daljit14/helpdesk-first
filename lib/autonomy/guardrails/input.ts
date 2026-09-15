import { checkTextSafety } from "@/lib/ai/safety-policy";
import { redactForLearning } from "@/lib/knowledge/learning-redaction";

export type UntrustedField = {
  source:
    | "ticket.title"
    | "ticket.description"
    | "diagnostic.answer"
    | "attachment.filename"
    | "attachment.metadata"
    | "attachment.text"
    | "knowledge"
    | "comment"
    | "event";
  text: string;
};

export type GuardedField = UntrustedField & { trust: "untrusted" };

export type InputGuardResult = {
  fields: GuardedField[];
  redactions: number;
  findings: { category: string; source: string }[];
  blocked: boolean;
  blockReason: string | null;
};

const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const TOKEN_PATTERN =
  /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g;
const ATTACHMENT_INJECTION =
  /\b(?:ignore previous|system:|assistant:|you must|run the following)\b/i;
const UNSAFE_REQUEST =
  /\b(?:bypass|disable|remove malware|bios|shell|powershell|delete files|turn off antivirus)\b/i;
const BLOCKED_CATEGORIES = new Set([
  "prompt-injection",
  "malware",
  "malware-report",
  "password-request",
  "password-bypass",
  "destructive-action",
  "security-disable",
  "unauthorized-access",
  "remote-access-request",
]);

function luhn(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alternate = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function redactSecrets(text: string): { text: string; count: number } {
  let count = 0;
  const cardText = text.replace(CARD_PATTERN, (match) => {
    if (!luhn(match)) return match;
    count += 1;
    return "[card]";
  });
  const tokenText = cardText.replace(TOKEN_PATTERN, () => {
    count += 1;
    return "[token]";
  });
  return { text: tokenText, count };
}

export function guardModelInput(
  fields: UntrustedField[],
  limits: { maxChars: number } = { maxChars: 8000 }
): InputGuardResult {
  let remaining = Math.max(0, limits.maxChars);
  let redactions = 0;
  const findings: { category: string; source: string }[] = [];
  const guarded: GuardedField[] = [];
  for (const field of fields) {
    if (remaining <= 0) break;
    const learned = redactForLearning(field.text, remaining);
    const secrets = redactSecrets(learned.text);
    redactions += Object.values(learned.summary).reduce(
      (total, value) => total + (value ?? 0),
      0
    );
    redactions += secrets.count;
    const text = secrets.text.slice(0, remaining);
    remaining -= text.length;
    const safety = checkTextSafety(field.text);
    if (!safety.allowed && safety.category) {
      findings.push({ category: safety.category, source: field.source });
    }
    if (UNSAFE_REQUEST.test(field.text)) {
      findings.push({ category: "destructive-action", source: field.source });
    }
    if (
      (field.source === "attachment.filename" ||
        field.source === "attachment.metadata" ||
        field.source === "attachment.text") &&
      ATTACHMENT_INJECTION.test(field.text)
    ) {
      findings.push({ category: "prompt-injection", source: field.source });
    }
    guarded.push({ ...field, text, trust: "untrusted" });
  }
  const blockedFinding = findings.find((finding) =>
    BLOCKED_CATEGORIES.has(finding.category)
  );
  return {
    fields: guarded,
    redactions,
    findings,
    blocked: Boolean(blockedFinding),
    blockReason: blockedFinding?.category ?? null,
  };
}
