import { checkUserMessageSafety } from "@/lib/ai/safety-policy";
import { getIssueBySlug } from "@/lib/search";
import { getIssueStepPolicies, isOfferable } from "@/lib/investigation/policy";
import { sanitizeForUser } from "./untrusted";

export const USER_STEP_OUTCOMES = ["done", "didnt_work", "cant_do"] as const;
export type UserStepOutcome = (typeof USER_STEP_OUTCOMES)[number];

export type UserStepCard = {
  stepId: string;
  instruction: string;
  why: string;
  source: {
    kind: "guide";
    guideSlug: string;
    stepIndex: number;
    title: string;
    url: string;
  };
};

export type UserStepCheck =
  | {
      ok: true;
      instruction: string;
      why: string;
      source: UserStepCard["source"];
    }
  | {
      ok: false;
      code: "unapproved_source" | "step_not_found" | "step_blocked";
      message: string;
    };

export function blockedUserStepReason(
  text: string,
  approvedSoftware: readonly string[]
): string | null {
  if (
    /\b(?:ask(?: for)?|request|need|enter|type|share|send|tell|give|provide|read out)\b[^.]{0,60}\b(?:passwords?|passcodes?|pins?|mfa(?:\s*\/\s*verification)?\s+codes?|verification codes?|one[- ]time codes?|recovery keys?|credentials?|tokens?)\b/i.test(
      text
    )
  )
    return "The step requests sensitive credentials.";
  if (
    /\b(?:turn off|disable|uninstall|pause|deactivate|stop)\b[^.]{0,80}\b(?:antivirus|firewall|defender|edr|security(?:\s+(?:tool|software|suite|application))?|protection|encryption|bitlocker)\b/i.test(
      text
    ) ||
    /\b(?:antivirus|firewall|defender|edr|security(?:\s+(?:tool|software|suite|application))?|protection|encryption|bitlocker)\b[^.]{0,80}\b(?:turn off|disable|uninstall|pause|deactivate|stop)\b/i.test(
      text
    )
  )
    return "The step asks to weaken a security tool.";
  if (
    /\b(?:install|download)\b/i.test(text) &&
    !approvedSoftware.some(
      (software) =>
        software.trim() && text.toLowerCase().includes(software.toLowerCase())
    )
  )
    return "The step asks to install software that is not approved.";
  return null;
}

function containsUrl(text: string): boolean {
  return /(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/i.test(
    text
  );
}

export async function checkUserStep(
  input: { issueSlug: string; stepIndex: number; why: string },
  ctx: {
    approvedSlugs: ReadonlySet<string>;
    approvedSoftware: readonly string[];
  }
): Promise<UserStepCheck> {
  if (!ctx.approvedSlugs.has(input.issueSlug))
    return {
      ok: false,
      code: "unapproved_source",
      message: "That guide is not approved for this organization.",
    };
  const issue = getIssueBySlug(input.issueSlug);
  if (!issue)
    return {
      ok: false,
      code: "unapproved_source",
      message: "That guide is not approved for this organization.",
    };
  const policies = getIssueStepPolicies(issue);
  if (
    !Number.isInteger(input.stepIndex) ||
    input.stepIndex < 0 ||
    input.stepIndex >= policies.length
  )
    return {
      ok: false,
      code: "step_not_found",
      message: "That step could not be found in the approved guide.",
    };
  const policy = policies[input.stepIndex];
  if (!isOfferable(policy.risk, "requester"))
    return {
      ok: false,
      code: "step_blocked",
      message: "That guide step is not suitable for a requester.",
    };
  const instruction = policy.text;
  if (
    blockedUserStepReason(instruction, ctx.approvedSoftware) ||
    containsUrl(input.why) ||
    blockedUserStepReason(input.why, ctx.approvedSoftware) ||
    (input.why.trim().length > 0 &&
      !checkUserMessageSafety({ message: input.why }).allowed)
  )
    return {
      ok: false,
      code: "step_blocked",
      message: "That step could not be safely offered.",
    };

  const sanitizedWhy = sanitizeForUser(input.why).trim().slice(0, 200);
  return {
    ok: true,
    instruction,
    why: sanitizedWhy || "This is a safe step from an approved guide.",
    source: {
      kind: "guide",
      guideSlug: issue.id,
      stepIndex: input.stepIndex,
      title: issue.title,
      url: `/issues/${issue.id}/guide`,
    },
  };
}
