import { credentialPattern } from "@/lib/tickets/scrub";

export type LearningEligibilityInput = {
  status: string;
  reopenCount: number | null;
  verificationMethod: string | null;
  verificationException: boolean | null;
  verifiedByUser: boolean | null;
  resolutionReport: unknown;
  textForScreening: string[];
};

export type LearningIneligibleReason =
  | "not_resolved"
  | "reopened"
  | "not_user_confirmed"
  | "verification_exception"
  | "incomplete_report"
  | "sensitive_topic"
  | "credentials_present";

export type LearningEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason: LearningIneligibleReason;
      manualReview: boolean;
      detail?: string;
    };

const sensitiveTopics: { label: string; matches: RegExp }[] = [
  {
    label: "password or MFA",
    matches:
      /\b(?:password|passcode|mfa|2fa|two[- ]factor|authenticator|one[- ]time code|reset (?:my )?login)\b/i,
  },
  {
    label: "recovery key",
    matches: /\b(?:recovery|bitlocker|filevault)\s+key\b/i,
  },
  {
    label: "suspected compromise",
    matches:
      /\b(?:hacked|compromised|breach(?:ed)?|phish(?:ing|ed)?|unauthori[sz]ed (?:access|login)|account takeover)\b/i,
  },
  {
    label: "malware investigation",
    matches:
      /\b(?:malware|ransomware|virus(?:es)?|trojan|spyware|keylogger|infected)\b/i,
  },
  {
    label: "student-sensitive information",
    matches:
      /\b(?:iep|504 plan|grade ?book|transcript|disciplinary|student (?:record|id|health)|counsel(?:l)?or notes?)\b/i,
  },
  {
    label: "invasive data recovery",
    matches:
      /\b(?:data recovery|recover(?:ed|ing)? (?:deleted|lost) files|forensic|disk imag(?:e|ing)|undelete)\b/i,
  },
  {
    label: "BIOS or firmware",
    matches: /\b(?:bios|uefi|firmware|flash(?:ed|ing)? the (?:board|chip))\b/i,
  },
];

const requiredReportFields = [
  "rootCause",
  "actionsPerformed",
  "toolsUsed",
  "preventiveRecommendation",
] as const;

function isCompleteReport(report: unknown): boolean {
  if (!report || typeof report !== "object") return false;
  const record = report as Record<string, unknown>;
  return requiredReportFields.every(
    (field) =>
      typeof record[field] === "string" &&
      (record[field] as string).trim().length > 0
  );
}

export function detectSensitiveTopic(text: string): string | null {
  return (
    sensitiveTopics.find((topic) => topic.matches.test(text))?.label ?? null
  );
}

export function evaluateLearningEligibility(
  input: LearningEligibilityInput
): LearningEligibility {
  if (input.status !== "Resolved") {
    return { eligible: false, reason: "not_resolved", manualReview: false };
  }
  if ((input.reopenCount ?? 0) > 0) {
    return { eligible: false, reason: "reopened", manualReview: false };
  }
  if (input.verificationException) {
    return {
      eligible: false,
      reason: "verification_exception",
      manualReview: true,
    };
  }
  if (input.verificationMethod !== "user_confirmed") {
    return {
      eligible: false,
      reason: "not_user_confirmed",
      manualReview: false,
    };
  }
  if (!isCompleteReport(input.resolutionReport)) {
    return {
      eligible: false,
      reason: "incomplete_report",
      manualReview: false,
    };
  }
  const screening = input.textForScreening.join("\n");
  if (credentialPattern.test(screening)) {
    return {
      eligible: false,
      reason: "credentials_present",
      manualReview: true,
    };
  }
  const topic = detectSensitiveTopic(screening);
  if (topic) {
    return {
      eligible: false,
      reason: "sensitive_topic",
      manualReview: true,
      detail: topic,
    };
  }
  return { eligible: true };
}
