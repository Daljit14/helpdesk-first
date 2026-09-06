import { checkUserMessageSafety } from "@/lib/ai/safety-policy";
import type { AiIntakeOutput } from "@/lib/ai/types";
import type { Issue } from "@/lib/issues";

export const AI_CONFIDENCE_THRESHOLD = 0.6;

export type HandoffReason =
  | "low_confidence"
  | "no_approved_guide"
  | "repeated_failure"
  | "insufficient_diagnostics"
  | "user_requested_human"
  | "admin_access_required"
  | "hardware_repair"
  | "security_concern"
  | "remote_assistance_required"
  | "credentials_involved"
  | "high_risk";

export type RouteInput = {
  ai: AiIntakeOutput;
  issue: Issue | null;
  userRequestedHuman: boolean;
  failedAttempts: number;
  questionCount: number;
  safetyFlags: string[];
};

export type RouteDecision =
  | {
      resolver: "ai";
      confidence: number;
      riskLevel: "low" | "medium" | "high";
      issueId: string;
    }
  | {
      resolver: "human";
      confidence: number;
      riskLevel: "low" | "medium" | "high";
      reason: HandoffReason;
    };

function handoffForSafety(flags: string[]): HandoffReason {
  if (flags.includes("credentials-involved")) return "credentials_involved";
  if (flags.includes("remote-assistance-required"))
    return "remote_assistance_required";
  if (flags.includes("hardware-repair")) return "hardware_repair";
  if (flags.includes("admin-access-required")) return "admin_access_required";
  return "security_concern";
}

export function routeTicket(input: RouteInput): RouteDecision {
  const confidence = Math.max(
    0,
    Math.min(1, input.ai.confidence ?? (input.ai.decision === "match" ? 1 : 0))
  );
  const riskLevel =
    input.safetyFlags.length > 0
      ? "high"
      : input.issue?.risk.toLowerCase() === "high"
        ? "high"
        : input.issue?.risk.toLowerCase() === "medium"
          ? "medium"
          : "low";

  if (input.safetyFlags.length > 0) {
    return {
      resolver: "human",
      confidence,
      riskLevel: "high",
      reason: handoffForSafety(input.safetyFlags),
    };
  }
  if (input.userRequestedHuman) {
    return {
      resolver: "human",
      confidence,
      riskLevel,
      reason: "user_requested_human",
    };
  }
  if (input.failedAttempts >= 2) {
    return {
      resolver: "human",
      confidence,
      riskLevel,
      reason: "repeated_failure",
    };
  }
  if (input.questionCount >= 3 && !input.issue) {
    return {
      resolver: "human",
      confidence,
      riskLevel,
      reason: "insufficient_diagnostics",
    };
  }
  if (input.ai.decision !== "match" || !input.issue) {
    return {
      resolver: "human",
      confidence,
      riskLevel,
      reason: "no_approved_guide",
    };
  }
  if (input.issue.risk === "High") {
    return {
      resolver: "human",
      confidence,
      riskLevel: "high",
      reason: "high_risk",
    };
  }
  if (confidence < AI_CONFIDENCE_THRESHOLD) {
    return {
      resolver: "human",
      confidence,
      riskLevel,
      reason: "low_confidence",
    };
  }
  return {
    resolver: "ai",
    confidence,
    riskLevel,
    issueId: input.issue.id,
  };
}

export function detectSafetyFlags(text: string): string[] {
  const flags: string[] = [];
  const value = text.toLowerCase();
  if (
    /\b(admin rights|administrator|bitlocker|group policy|domain)\b/.test(value)
  ) {
    flags.push("admin-access-required");
  }
  if (
    /\b(broken screen|cracked|liquid|won't turn on|dead battery|replace)\b/.test(
      value
    )
  ) {
    flags.push("hardware-repair");
  }
  if (/\b(remote into|take control|remote assistance)\b/.test(value)) {
    flags.push("remote-assistance-required");
  }
  if (/\b(hacked|someone logged in|unauthorized)\b/.test(value)) {
    flags.push("unauthorized-access");
  }
  const safety = checkUserMessageSafety({ message: text });
  if (safety.category === "malware" || safety.category === "malware-report") {
    flags.push("malware");
  }
  if (
    safety.category === "password-request" ||
    safety.category === "password-bypass" ||
    safety.category === "recovery-key-request"
  ) {
    flags.push("credentials-involved");
  }
  return [...new Set(flags)];
}
