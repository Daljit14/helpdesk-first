import type { CapabilityDefinition } from "@/lib/autonomy/capabilities/types";

export const REQUESTER_AGENT_DENYLIST = [
  /(?:account[_-]?)?unlock/i,
  /mfa[_-]?(?:reset|enroll|enrollment)|(?:reset|enroll|enrollment)[_-]?mfa/i,
  /recovery[_-]?method/i,
  /(?:change|grant|add|remove|modify|update)[_-]?(?:privilege|group|role|admin)|(?:privilege|group|role|admin)[_-]?(?:change|grant|add|remove|modify|update)/i,
  /(?:security[_-]?disable|realtime[_-]?off|firewall[_-]?off|vpn[_-]?bypass|edr[_-]?(?:remove|disable|exclusion)|defender[_-]?(?:off|disable|exclusion|remove))/i,
  /(?:^|[_-])delete(?:[_-]|$)(?!temp)/i,
  /(?:software[_-]?)install/i,
  /display[_-]?reset/i,
] as const;

export function isDenylisted(
  capabilityId: string,
  definition?: Pick<CapabilityDefinition, "rollback" | "sideEffects">
): boolean {
  if (capabilityId === "send_password_reset_link") return false;
  if (REQUESTER_AGENT_DENYLIST.some((pattern) => pattern.test(capabilityId)))
    return true;
  if (
    definition &&
    definition.sideEffects !== "read_only" &&
    definition.rollback === "none"
  )
    return true;
  return false;
}
