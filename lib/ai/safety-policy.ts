import type { Platform } from "@/lib/helpdesk-data";
import { getIssueBySlug } from "@/lib/search";
import type {
  AiIntakeInput,
  AiIntakeOutput,
  DiagnosticQuestion,
} from "./types";

export const UNSAFE_CATEGORIES = [
  "password-request",
  "mfa-request",
  "recovery-key-request",
  "remote-access-request",
  "malware",
  "password-bypass",
  "destructive-action",
  "security-disable",
  "prompt-injection",
  "unauthorized-access",
  "unsupported",
] as const;

export type UnsafeCategory = (typeof UNSAFE_CATEGORIES)[number];

export type UserMessageSafety = {
  allowed: boolean;
  category?: UnsafeCategory;
  reason?: string;
};

export type AiOutputValidation = {
  valid: boolean;
  errors: string[];
};

export type AiAvailability = {
  enabled: boolean;
  reason?: string;
};

export function isAiEnabled(): AiAvailability {
  const value = process.env.HELP_DESK_AI_ENABLED;
  if (value === "true") {
    return { enabled: true };
  }
  return { enabled: false, reason: "AI intake is currently disabled." };
}

export function getSafeResponseLimit(): number {
  const parsed = parseInt(
    process.env.HELP_DESK_AI_MAX_DIAGNOSTIC_QUESTIONS ?? "3",
    10
  );
  return Number.isNaN(parsed) ? 3 : Math.max(0, Math.min(parsed, 5));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function checkUserMessageSafety(
  input: AiIntakeInput
): UserMessageSafety {
  const text = normalizeText(input.message);
  if (text.length === 0) {
    return {
      allowed: false,
      category: "unsupported",
      reason: "No problem description was provided.",
    };
  }

  const tokens = new Set(text.split(" "));

  // Prompt-injection and role-change attempts
  if (
    /\bignore (previous|the above|all prior|your) instructions\b|\bignore (the )?system prompt\b|\byou are (now|a) (?:hacker|IT admin|admin|security expert|expert|developer|malicious|unrestricted)\b|\bDAN\b|\bdo (not|n't) (?:follow|obey|listen|enforce)\b|\bdisregard (safety|policy|rules)\b|\bnew role\b|\bforget (your )?instructions\b|\bfrom now on you\b|\bpwned mode\b|\bdisable (safety|your safety|policy|rules)\b/i.test(
      text
    )
  ) {
    return {
      allowed: false,
      category: "prompt-injection",
      reason:
        "The assistant cannot change its safety rules based on instructions in your message.",
    };
  }

  // Credential requests
  const credentialTerms = [
    ["password"],
    ["mfa", "code"],
    ["2fa", "code"],
    ["two", "factor", "code"],
    ["verification", "code"],
    ["auth", "code"],
    ["recovery", "code"],
    ["recovery", "key"],
    ["secret", "key"],
    ["pin", "code"],
  ];
  const credentialActions = [
    "send",
    "type",
    "enter",
    "paste",
    "give",
    "provide",
    "share",
    "tell",
    "show",
    "request",
  ];
  const hasCredentialTerm = credentialTerms.some((term) =>
    term.every((word) => tokens.has(word))
  );
  const hasCredentialAction = credentialActions.some((action) =>
    tokens.has(action)
  );
  if (hasCredentialTerm && hasCredentialAction) {
    return {
      allowed: false,
      category: "password-request",
      reason: "The assistant will never ask for passwords, codes, or keys.",
    };
  }

  // Password or security bypass
  const bypassVerbs = [
    "bypass",
    "crack",
    "break",
    "defeat",
    "remove",
    "reset",
    "unlock",
    "disable",
    "turn",
  ];
  const securityTargets = [
    "password",
    "pin",
    "passcode",
    "lockscreen",
    "lock",
    "security",
    "firewall",
    "antivirus",
    "defender",
    "encryption",
    "2fa",
    "mfa",
    "twofactor",
  ];
  const hasBypassVerb = bypassVerbs.some((verb) => tokens.has(verb));
  const hasSecurityTarget = securityTargets.some((target) =>
    tokens.has(target)
  );
  const hasBypassPhrase =
    /\b(bypass login|password bypass|remove password|remove lock|unlock account|unlock phone|unlock computer|unlock device|turn off security|turn off firewall|turn off antivirus|disable security|disable antivirus)\b/i.test(
      text
    );
  if ((hasBypassVerb && hasSecurityTarget) || hasBypassPhrase) {
    return {
      allowed: false,
      category: "password-bypass",
      reason:
        "The assistant cannot help with bypassing passwords or security controls.",
    };
  }

  // Remote access / control
  if (
    /\b(remote access|remote control|teamviewer|anydesk|screen connect|logmein|rdp|remote desktop|control my computer|take over|connect to my device|access my (pc|computer|mac|phone))\b/i.test(
      text
    )
  ) {
    return {
      allowed: false,
      category: "remote-access-request",
      reason:
        "The assistant cannot start remote access or take control of your device.",
    };
  }

  // Malware, destructive, unauthorized
  if (
    /\b(malware|virus|trojan|ransomware|keylogger|spyware|hack|exploit|infect|destroy data|delete (system|all) files|format (disk|drive)|wipe|factory reset)\b/i.test(
      text
    )
  ) {
    return {
      allowed: false,
      category: "malware",
      reason:
        "The assistant cannot help with malware, destructive actions, or unauthorized access.",
    };
  }

  if (
    /\b(registry|BIOS|firmware|cmd\.exe|powershell|terminal|shell script|bash|sudo|regedit|delete system files|disable security|uninstall antivirus)\b/i.test(
      text
    )
  ) {
    return {
      allowed: false,
      category: "destructive-action",
      reason:
        "The assistant cannot guide you through destructive, low-level, or security-altering actions.",
    };
  }

  return { allowed: true };
}

export function validateAiOutput(
  output: unknown,
  allowedSlugs: string[],
  allowedQuestions: DiagnosticQuestion[],
  allowedPlatforms: readonly string[]
): AiOutputValidation {
  const errors: string[] = [];

  if (!output || typeof output !== "object") {
    return { valid: false, errors: ["AI response is not a valid object."] };
  }

  const o = output as Partial<AiIntakeOutput>;

  if (!o.decision || !["match", "clarify", "escalate"].includes(o.decision)) {
    errors.push("AI response has an invalid or missing decision.");
  }

  if (
    o.matchedIssueSlug !== undefined &&
    typeof o.matchedIssueSlug !== "string"
  ) {
    errors.push("matchedIssueSlug must be a string.");
  }

  if (
    o.detectedPlatform !== undefined &&
    o.detectedPlatform !== null &&
    !allowedPlatforms.includes(o.detectedPlatform)
  ) {
    errors.push(`detectedPlatform "${o.detectedPlatform}" is not supported.`);
  }

  if (o.diagnosticQuestionIds !== undefined) {
    if (!Array.isArray(o.diagnosticQuestionIds)) {
      errors.push("diagnosticQuestionIds must be an array.");
    } else if (o.diagnosticQuestionIds.length > getSafeResponseLimit()) {
      errors.push(
        `AI returned more than ${getSafeResponseLimit()} diagnostic questions.`
      );
    } else {
      const validIds = new Set(allowedQuestions.map((q) => q.id));
      for (const id of o.diagnosticQuestionIds) {
        if (typeof id !== "string" || !validIds.has(id)) {
          errors.push(`Unknown or invalid diagnostic question ID: ${id}`);
        }
      }
    }
  }

  if (o.explanation !== undefined && !isSafeString(o.explanation)) {
    errors.push("AI explanation contains unsafe content.");
  }

  if (o.escalationReason !== undefined && !isSafeString(o.escalationReason)) {
    errors.push("Escalation reason contains unsafe content.");
  }

  if (o.decision === "match") {
    if (!o.matchedIssueSlug) {
      errors.push("A match decision must include matchedIssueSlug.");
    } else if (!allowedSlugs.includes(o.matchedIssueSlug)) {
      errors.push(
        `matchedIssueSlug "${o.matchedIssueSlug}" is not an approved issue.`
      );
    }

    const issue = o.matchedIssueSlug
      ? getIssueBySlug(o.matchedIssueSlug)
      : undefined;
    const platform = (o.detectedPlatform as Platform | undefined) ?? null;
    if (issue && platform && !issue.platforms.includes(platform)) {
      errors.push(
        `Issue "${issue.title}" does not support platform "${platform}".`
      );
    }

    if (!o.explanation || o.explanation.trim() === "") {
      errors.push("A match decision must include a safe explanation.");
    }
  }

  if (o.decision === "clarify") {
    if (!o.diagnosticQuestionIds || o.diagnosticQuestionIds.length === 0) {
      errors.push("A clarify decision must include diagnosticQuestionIds.");
    }
  }

  if (o.decision === "escalate") {
    if (!o.escalationReason || o.escalationReason.trim() === "") {
      errors.push("An escalate decision must include an escalationReason.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function isSafeString(value: string): boolean {
  if (typeof value !== "string") return false;
  if (
    /\b(password|mfa|2fa|recovery code|recovery key|secret)\b.*\b(send|enter|paste|type)\b|\b( registry | BIOS | firmware | cmd\.exe | powershell | terminal | shell | sudo | regedit | delete system files | disable security | uninstall antivirus | remote access | teamviewer | anydesk | malware )\b|https?:\/\/(?!support\.microsoft\.com|support\.apple\.com|support\.google\.com|support\.mozilla\.org|www\.hplftsupport\.com|support\.hp\.com|epson\.com|canon\.com|brother-usa\.com|support\.xerox\.com)[^\s]+/i.test(
      value
    )
  ) {
    return false;
  }

  // Reject any URL that is not in the small whitelist above
  const unapprovedUrl = value.match(/https?:\/\/[^\s]+/gi);
  if (unapprovedUrl) {
    return false;
  }

  return true;
}

export function validateAndCoerceOutput(
  output: unknown,
  allowedSlugs: string[],
  allowedQuestions: DiagnosticQuestion[],
  allowedPlatforms: readonly string[]
): AiIntakeOutput | null {
  const validation = validateAiOutput(
    output,
    allowedSlugs,
    allowedQuestions,
    allowedPlatforms
  );
  if (!validation.valid) {
    return null;
  }
  return output as AiIntakeOutput;
}

export function normalizeSafetyText(value: string): string {
  return normalizeText(value);
}
