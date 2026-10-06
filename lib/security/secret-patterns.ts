export type SecretKind =
  | "token"
  | "api_key"
  | "jwt"
  | "password"
  | "mfa_code"
  | "card"
  | "aws_key"
  | "private_key";

export const SECRET_PATTERNS: ReadonlyArray<{
  kind: SecretKind;
  pattern: RegExp;
  auditLabel: string;
}> = [
  {
    kind: "api_key",
    pattern: /\b(?:sk|pk)[_-][A-Za-z0-9_-]{6,}\b/gi,
    auditLabel: "[token removed]",
  },
  {
    kind: "aws_key",
    pattern: /\bAKIA[A-Z0-9]{16}\b/g,
    auditLabel: "[aws key removed]",
  },
  {
    kind: "card",
    pattern: /\b\d{4}(?:[ -]\d{4}){3}\b/g,
    auditLabel: "[card removed]",
  },
  {
    kind: "card",
    pattern: /(?<![\d.])(?:\d[ -]*?){13,19}(?![\d.])/g,
    auditLabel: "[card removed]",
  },
  {
    kind: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    auditLabel: "[jwt removed]",
  },
  {
    kind: "password",
    pattern:
      /\b(?:token|secret|password|api[_-]?key)\s*(?:is|was|[:=])\s*[^\n,;]+/gi,
    auditLabel: "[token removed]",
  },
  {
    kind: "mfa_code",
    pattern:
      /\b(?:mfa\s*code|verification\s*code|recovery\s*key|passcode)\s*(?:is|was|[:=])\s*[^\n,;]+/gi,
    auditLabel: "[credential removed]",
  },
  {
    kind: "private_key",
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    auditLabel: "[credential removed]",
  },
  {
    kind: "token",
    pattern: /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
    auditLabel: "[credential removed]",
  },
  {
    kind: "api_key",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    auditLabel: "[credential removed]",
  },
  {
    kind: "api_key",
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    auditLabel: "[credential removed]",
  },
  {
    kind: "api_key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    auditLabel: "[credential removed]",
  },
];

export function luhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}
