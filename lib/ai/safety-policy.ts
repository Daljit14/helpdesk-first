import type { Platform } from "@/lib/helpdesk-data";
import { getIssueBySlug } from "@/lib/search";
import type {
  AiIntakeInput,
  AiIntakeOutput,
  DiagnosticQuestion,
} from "./types";

export const MAX_EXPLANATION_LENGTH = 500;
export const MAX_ESCALATION_REASON_LENGTH = 500;

export const UNSAFE_CATEGORIES = [
  "password-request",
  "mfa-request",
  "recovery-key-request",
  "remote-access-request",
  "malware",
  "malware-report",
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

const ALLOWED_OUTPUT_KEYS = new Set([
  "decision",
  "matchedIssueSlug",
  "detectedPlatform",
  "diagnosticQuestionIds",
  "explanation",
  "escalationReason",
]);

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
  return Number.isNaN(parsed) ? 3 : Math.max(0, Math.min(parsed, 3));
}

export function getProviderTimeoutMs(): number {
  const raw = process.env.HELP_DESK_AI_PROVIDER_TIMEOUT_MS;
  if (raw === undefined) {
    return 8000;
  }
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 8000;
  // Allow an explicit override in tests; production defaults to a safe 8s.
  return Math.max(0, Math.min(parsed, 10000));
}

export function normalizeSafetyText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPasswordRecovery(text: string): boolean {
  const normalized = normalizeSafetyText(text);
  const tokens = new Set(normalized.split(" "));

  const forbidden = new Set([
    "bypass",
    "crack",
    "break",
    "hack",
    "hacking",
    "remove",
    "steal",
    "someone",
    "someones",
    "somebody",
    "another",
    "their",
    "install",
    "create",
    "make",
    "build",
    "code",
    "develop",
    "deploy",
    "exploit",
    "keylogger",
    "spy",
    "spyware",
    "ransomware",
    "trojan",
    "virus",
    "unlock",
    "disable",
    "defeat",
    "defeated",
  ]);

  if ([...forbidden].some((word) => tokens.has(word))) {
    return false;
  }

  const recoveryPatterns = [
    /\bforgot(?:\s+my)?(?:\s+email)?\s+(?:password|login)\b/,
    /\bforgot(?:\s+my)?\s+password\b/,
    /\breset(?:\s+my)?(?:\s+email)?\s+(?:password|login)\b/,
    /\brecover(?:\s+my)?(?:\s+email)?\s+(?:password|login)\b/,
    /\bpassword\s+(?:is\s+)?wrong\b/,
    /\bwrong\s+(?:email\s+)?password\b/,
    /\bemail\s+says\s+(?:my\s+)?password\s+is\s+wrong\b/,
    /\bcannot\s+(?:sign|log)\s+in(?:\s+to\s+my\s+email)?\b/,
    /\bemail\s+(?:sign\s+in|login|log\s+in)\s+problem\b/,
    /\bsign\s+in\s+problem\b/,
    /\bhow\s+do\s+i\s+reset\s+my\s+password\b/,
    /\breset\s+my\s+password\s+through\s+the\s+official\s+(?:website|portal)\b/,
  ];

  return recoveryPatterns.some((pattern) => pattern.test(normalized));
}

export function isMalwareVictim(text: string): boolean {
  const normalized = normalizeSafetyText(text);

  const victimPatterns = [
    /\bi\s+think\s+(?:my|the)\s+.*\s+(?:has|have)\s+(?:a\s+)?(?:virus|malware|trojan|ransomware)\b/,
    /\bi\s+see(?:ed)?\s+(?:a\s+)?(?:virus|malware|pop\s*up|pop-up|popup)\b/,
    /\bthere\s+is\s+(?:a\s+)?(?:virus|malware)\s+on\s+my\b/,
    /\bmy\s+.*\s+(?:is\s+)?infected\b/,
    /\bsuspicious\s+(?:pop\s*up|pop-up|popup|message|email|link)\b/,
    /\bransomware\s+(?:message|pop\s*up|pop-up|popup|warning|screen)\b/,
    /\bvirus\s+pop\s*up\b/,
    /\bmalware\s+pop\s*up\b/,
    /\bi\s+have\s+(?:a\s+)?virus\b/,
    /\bcomputer\s+has\s+(?:a\s+)?virus\b/,
  ];

  if (!victimPatterns.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  const maliciousModifiers = [
    /\bcreate\b/,
    /\binstall\b/,
    /\bmake\b/,
    /\bbuild\b/,
    /\bwrite\b/,
    /\bcode\b/,
    /\bdevelop\b/,
    /\bdeploy\b/,
    /\bexploit\b/,
    /\bhack\b/,
    /\bkeylogger\b/,
    /\bspy\s+on\b/,
    /\bsteal\b/,
    /\bspying\b/,
    /\bto\s+\w+\s+(?:account|computer|device|network)\b/,
  ];

  return !maliciousModifiers.some((pattern) => pattern.test(normalized));
}

function isMaliciousRequest(text: string): boolean {
  const normalized = normalizeSafetyText(text);

  if (isMalwareVictim(text)) {
    return false;
  }

  if (
    /\b(create|install|make|build|write|code|develop|deploy)\s+(?:a\s+)?(?:malware|virus|trojan|ransomware|keylogger|spyware)\b/.test(
      normalized
    )
  ) {
    return true;
  }

  if (
    /\bkeylogger\s+to\s+spy\b|\bspy\s+on\s+.*\b|\bhack\s+.*\baccount\b/.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
}

function checkTextSafety(text: string): UserMessageSafety {
  const normalized = normalizeSafetyText(text);
  const tokens = new Set(normalized.split(" "));

  if (text.trim().length === 0) {
    return {
      allowed: false,
      category: "unsupported",
      reason: "No text was provided.",
    };
  }

  // Prompt-injection and role-change attempts
  if (
    /\bignore (previous|the above|all prior|your) instructions\b|\bignore (the )?system prompt\b|\byou are (now|a) (?:hacker|IT admin|admin|security expert|expert|developer|malicious|unrestricted)\b|\bDAN\b|\bdo (not|n't) (?:follow|obey|listen|enforce)\b|\bdisregard (safety|policy|rules)\b|\bnew role\b|\bforget (your )?instructions\b|\bfrom now on you\b|\bpwned mode\b|\bdisable (safety|your safety|policy|rules)\b/i.test(
      normalized
    )
  ) {
    return {
      allowed: false,
      category: "prompt-injection",
      reason:
        "The assistant cannot change its safety rules based on instructions in your message.",
    };
  }

  // Remote access / control
  if (
    /\b(remote access|remote control|teamviewer|anydesk|screen connect|logmein|rdp|remote desktop|control my computer|take over|connect to my device|access my (pc|computer|mac|phone))\b/i.test(
      normalized
    )
  ) {
    return {
      allowed: false,
      category: "remote-access-request",
      reason:
        "The assistant cannot start remote access or take control of your device.",
    };
  }

  // Destructive commands
  if (
    /\b(registry|BIOS|firmware|cmd\.exe|powershell|terminal|shell script|bash|sudo|regedit|delete system files|disable security|uninstall antivirus)\b/i.test(
      normalized
    )
  ) {
    return {
      allowed: false,
      category: "destructive-action",
      reason:
        "The assistant cannot guide you through destructive, low-level, or security-altering actions.",
    };
  }

  // Victim malware reports
  if (isMalwareVictim(text)) {
    return {
      allowed: false,
      category: "malware-report",
      reason:
        "If you think your device is infected or you see a suspicious pop-up, do not click any links, pay money, call a displayed number, or share your credentials. Contact your qualified IT support team right away.",
    };
  }

  // Malicious malware requests
  if (
    /\b(malware|virus|trojan|ransomware|keylogger|spyware|hack|exploit|infect|destroy data|delete (system|all) files|format (disk|drive)|wipe|factory reset)\b/i.test(
      normalized
    ) ||
    isMaliciousRequest(text)
  ) {
    return {
      allowed: false,
      category: "malware",
      reason:
        "The assistant cannot help with malware, destructive actions, or unauthorized access.",
    };
  }

  // Password recovery is allowed, so skip bypass checks when recognized.
  if (isPasswordRecovery(text)) {
    return { allowed: true };
  }

  // Credential requests
  const credentialTerms = [
    ["password"],
    ["passwords"],
    ["mfa", "code"],
    ["mfa", "codes"],
    ["2fa", "code"],
    ["2fa", "codes"],
    ["two", "factor", "code"],
    ["verification", "code"],
    ["verification", "codes"],
    ["auth", "code"],
    ["recovery", "code"],
    ["recovery", "codes"],
    ["recovery", "key"],
    ["secret", "key"],
    ["pin", "code"],
    ["pin", "codes"],
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
      normalized
    );
  if ((hasBypassVerb && hasSecurityTarget) || hasBypassPhrase) {
    return {
      allowed: false,
      category: "password-bypass",
      reason:
        "The assistant cannot help with bypassing passwords or security controls.",
    };
  }

  return { allowed: true };
}

export function checkUserMessageSafety(
  input: AiIntakeInput
): UserMessageSafety {
  const texts = [input.message];
  if (input.previousAnswers) {
    for (const answer of input.previousAnswers) {
      texts.push(answer.answer);
    }
  }

  for (const text of texts) {
    const result = checkTextSafety(text);
    if (!result.allowed) {
      // Do not echo the user's content; return the policy reason only.
      return {
        allowed: false,
        category: result.category,
        reason: result.reason,
      };
    }
  }

  // Also screen the combined text so split prompt injection is harder.
  const combined = texts.join(" ");
  const combinedResult = checkTextSafety(combined);
  if (!combinedResult.allowed) {
    return {
      allowed: false,
      category: combinedResult.category,
      reason: combinedResult.reason,
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

  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { valid: false, errors: ["AI response is not a valid object."] };
  }

  const o = output as Record<string, unknown>;

  for (const key of Object.keys(o)) {
    if (!ALLOWED_OUTPUT_KEYS.has(key)) {
      errors.push(`Unexpected output property: ${key}`);
    }
  }

  if (
    !o.decision ||
    !["match", "clarify", "escalate"].includes(o.decision as string)
  ) {
    errors.push("AI response has an invalid or missing decision.");
    return { valid: false, errors };
  }

  const decision = o.decision as "match" | "clarify" | "escalate";

  if (
    o.matchedIssueSlug !== undefined &&
    typeof o.matchedIssueSlug !== "string"
  ) {
    errors.push("matchedIssueSlug must be a string.");
  }

  if (
    o.detectedPlatform !== undefined &&
    o.detectedPlatform !== null &&
    (typeof o.detectedPlatform !== "string" ||
      !allowedPlatforms.includes(o.detectedPlatform))
  ) {
    errors.push(`detectedPlatform is missing or not supported.`);
  }

  if (o.diagnosticQuestionIds !== undefined) {
    if (!Array.isArray(o.diagnosticQuestionIds)) {
      errors.push("diagnosticQuestionIds must be an array.");
    } else {
      const limit = getSafeResponseLimit();
      if (o.diagnosticQuestionIds.length > limit) {
        errors.push(`AI returned more than ${limit} diagnostic questions.`);
      }
      const validIds = new Set(allowedQuestions.map((q) => q.id));
      const seen = new Set<string>();
      for (const id of o.diagnosticQuestionIds) {
        if (typeof id !== "string") {
          errors.push("diagnosticQuestionIds must contain strings.");
        } else if (!validIds.has(id)) {
          errors.push(`Unknown diagnostic question ID: ${id}`);
        } else if (seen.has(id)) {
          errors.push(`Duplicate diagnostic question ID: ${id}`);
        } else {
          seen.add(id);
        }
      }
    }
  }

  if (o.explanation !== undefined) {
    if (typeof o.explanation !== "string") {
      errors.push("explanation must be a string.");
    } else if (o.explanation.length > MAX_EXPLANATION_LENGTH) {
      errors.push("explanation is too long.");
    } else if (!isSafeString(o.explanation)) {
      errors.push("AI explanation contains unsafe content.");
    }
  }

  if (o.escalationReason !== undefined) {
    if (typeof o.escalationReason !== "string") {
      errors.push("escalationReason must be a string.");
    } else if (o.escalationReason.length > MAX_ESCALATION_REASON_LENGTH) {
      errors.push("escalationReason is too long.");
    } else if (!isSafeString(o.escalationReason)) {
      errors.push("Escalation reason contains unsafe content.");
    }
  }

  if (decision === "match") {
    if (!o.matchedIssueSlug || typeof o.matchedIssueSlug !== "string") {
      errors.push("A match decision must include matchedIssueSlug.");
    } else if (!allowedSlugs.includes(o.matchedIssueSlug)) {
      errors.push(
        `matchedIssueSlug "${o.matchedIssueSlug}" is not an approved issue.`
      );
    }

    if (o.detectedPlatform === null || o.detectedPlatform === undefined) {
      errors.push("A match decision must include a supported platform.");
    } else if (
      typeof o.detectedPlatform !== "string" ||
      !allowedPlatforms.includes(o.detectedPlatform)
    ) {
      errors.push("A match decision must include a supported platform.");
    } else {
      const issue = getIssueBySlug(o.matchedIssueSlug as string);
      if (
        issue &&
        typeof o.detectedPlatform === "string" &&
        !issue.platforms.includes(o.detectedPlatform as Platform)
      ) {
        errors.push(
          `Issue "${issue.title}" does not support platform "${o.detectedPlatform}".`
        );
      }
    }

    if (
      !o.explanation ||
      typeof o.explanation !== "string" ||
      o.explanation.trim() === ""
    ) {
      errors.push("A match decision must include a safe explanation.");
    }

    if (o.diagnosticQuestionIds !== undefined) {
      errors.push("A match decision must not include diagnosticQuestionIds.");
    }

    if (o.escalationReason !== undefined) {
      errors.push("A match decision must not include escalationReason.");
    }
  }

  if (decision === "clarify") {
    if (
      !Array.isArray(o.diagnosticQuestionIds) ||
      o.diagnosticQuestionIds.length === 0
    ) {
      errors.push("A clarify decision must include diagnosticQuestionIds.");
    }

    if (o.matchedIssueSlug !== undefined) {
      errors.push("A clarify decision must not include matchedIssueSlug.");
    }

    if (o.escalationReason !== undefined) {
      errors.push("A clarify decision must not include escalationReason.");
    }
  }

  if (decision === "escalate") {
    if (
      !o.escalationReason ||
      typeof o.escalationReason !== "string" ||
      o.escalationReason.trim() === ""
    ) {
      errors.push("An escalate decision must include an escalationReason.");
    }

    if (o.matchedIssueSlug !== undefined) {
      errors.push("An escalate decision must not include matchedIssueSlug.");
    }

    if (o.diagnosticQuestionIds !== undefined) {
      errors.push(
        "An escalate decision must not include diagnosticQuestionIds."
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function isSafeString(value: string): boolean {
  if (typeof value !== "string") return false;

  if (/<[^>]+>/.test(value)) {
    return false;
  }

  if (
    /\b(password|mfa|2fa|recovery code|recovery key|secret)\b.*\b(send|enter|paste|type)\b|\b( registry | BIOS | firmware | cmd\.exe | powershell | terminal | shell | sudo | regedit | delete system files | disable security | uninstall antivirus | remote access | teamviewer | anydesk | malware )\b|https?:\/\/[^\s]+/i.test(
      value
    )
  ) {
    return false;
  }

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

  const o = output as Record<string, unknown>;
  const coerced: AiIntakeOutput = {
    decision: o.decision as AiIntakeOutput["decision"],
  };

  if (typeof o.matchedIssueSlug === "string") {
    coerced.matchedIssueSlug = o.matchedIssueSlug;
  }
  if (
    o.detectedPlatform === null ||
    (typeof o.detectedPlatform === "string" &&
      allowedPlatforms.includes(o.detectedPlatform))
  ) {
    coerced.detectedPlatform = o.detectedPlatform as
      Platform | null | undefined;
  }
  if (Array.isArray(o.diagnosticQuestionIds)) {
    coerced.diagnosticQuestionIds = o.diagnosticQuestionIds as string[];
  }
  if (typeof o.explanation === "string") {
    coerced.explanation = o.explanation;
  }
  if (typeof o.escalationReason === "string") {
    coerced.escalationReason = o.escalationReason;
  }

  return coerced;
}
