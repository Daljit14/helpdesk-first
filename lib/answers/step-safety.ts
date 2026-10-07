import { blockedUserStepReason, containsUrl } from "@/lib/agent/user-steps";

export type StepSafetyReason =
  | "credentials"
  | "security_tool"
  | "registry_or_policy"
  | "script_or_command"
  | "unapproved_install"
  | "other_account"
  | "admin_rights"
  | "link";

const REGISTRY_OR_POLICY =
  /\b(?:regedit|registry|hkey_[a-z0-9_]+|hklm|hkcu|gpedit|group policy|local security policy|defaults\s+write)\b/i;
const SCRIPT_OR_COMMAND =
  /\b(?:powershell(?:\.exe)?|cmd(?:\.exe)?|command prompt|terminal|bash|shell|sudo|curl|wget|iwr|irm)\b|(?:^|\n)\s*(?:\$\s|>\s)|`|\b(?:run|execute|copy|paste|use)\b[^.\n]{0,60}\b(?:script|commands?)\b|\b[\w.-]+\.(?:ps1|bat|cmd|sh|bash|zsh|command|py|pyw|js|exe)\b/i;
const OTHER_ACCOUNT =
  /\b(?:another|other|different)\s+(?:user(?:'s|s)?\s+)?(?:accounts?|profiles?|devices?|computers?|emails?|mailboxes?|logins?)\b|\b(?:someone|somebody)\s+else(?:'s|s)\s+(?:accounts?|profiles?|devices?|computers?|emails?|mailboxes?|logins?)\b|\b(?:coworker|colleague|another person|other person)(?:'s|s)?\s+(?:accounts?|profiles?|devices?|computers?|emails?|mailboxes?|logins?)\b/i;
const ADMIN_RIGHTS =
  /\b(?:admin(?:istrator)?\s+(?:rights?|privileges?|accounts?|passwords?|approval)|administrator|local\s+admin(?:istrator)?|uac(?:\s+approval)?|elevat(?:ed|ion)|run\s+as\s+admin(?:istrator)?)\b/i;

function blockedReasonCode(text: string, approvedSoftware: readonly string[]) {
  const reason = blockedUserStepReason(text, approvedSoftware);
  if (reason === "The step requests sensitive credentials.")
    return "credentials" as const;
  if (reason === "The step asks to weaken a security tool.")
    return "security_tool" as const;
  if (reason === "The step asks to install software that is not approved.")
    return "unapproved_install" as const;
  return null;
}

export function screenAnswerStep(
  text: string,
  approvedSoftware: readonly string[]
): StepSafetyReason | null {
  const blocked = blockedReasonCode(text, approvedSoftware);
  if (blocked === "credentials" || blocked === "security_tool") return blocked;
  if (REGISTRY_OR_POLICY.test(text)) return "registry_or_policy";
  if (SCRIPT_OR_COMMAND.test(text)) return "script_or_command";
  if (blocked === "unapproved_install") return blocked;
  if (OTHER_ACCOUNT.test(text)) return "other_account";
  if (ADMIN_RIGHTS.test(text)) return "admin_rights";
  if (containsUrl(text)) return "link";
  return null;
}
