import { redactForLearning } from "@/lib/knowledge/learning-redaction";
import { SECRET_PATTERNS } from "@/lib/security/secret-patterns";

const MAX_DEPTH = 6;
const MAX_KEYS = 100;
const MAX_STRING = 500;

function redactString(value: string): string {
  return SECRET_PATTERNS.reduce(
    (text, secret) => text.replace(secret.pattern, secret.auditLabel),
    redactForLearning(value, MAX_STRING).text
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
