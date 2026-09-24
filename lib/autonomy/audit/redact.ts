import { redactForLearning } from "@/lib/knowledge/learning-redaction";

const MAX_DEPTH = 6;
const MAX_KEYS = 100;
const MAX_STRING = 500;

function redactString(value: string): string {
  return redactForLearning(value, MAX_STRING)
    .text.replace(/\b(?:sk|pk)[_-][A-Za-z0-9_-]{6,}\b/gi, "[token removed]")
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, "[aws key removed]")
    .replace(/\b\d{4}(?:[ -]\d{4}){3}\b/g, "[card removed]")
    .replace(/(?<![\d.])(?:\d[ -]*?){13,19}(?![\d.])/g, "[card removed]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[jwt removed]"
    )
    .replace(
      /\b(?:token|secret|password|api[_-]?key)\s*(?:is|was|[:=])\s*[^\n,;]+/gi,
      "[token removed]"
    )
    .replace(
      /\b(?:mfa\s*code|verification\s*code|recovery\s*key|passcode)\s*(?:is|was|[:=])\s*[^\n,;]+/gi,
      "[credential removed]"
    );
}

function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactString(value);
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_KEYS).map((item) => redactValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, MAX_KEYS)) {
      out[key] = redactValue(item, depth + 1);
    }
    return out;
  }
  return null;
}

/** Redacts credentials and personal data from audit payloads; never throws. */
export function redactAuditDetail<T extends Record<string, unknown>>(
  detail: T
): Record<string, unknown> {
  try {
    const result = redactValue(detail, 0);
    return result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : {};
  } catch {
    return { redaction: "failed" };
  }
}
