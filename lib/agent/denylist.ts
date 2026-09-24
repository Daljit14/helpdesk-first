import type { CapabilityDefinition } from "@/lib/autonomy/capabilities/types";

export const REQUESTER_AGENT_DENYLIST = [
  /unlock/i,
  /mfa.*(reset|enroll)|(?:reset|enroll).*mfa/i,
  /recovery.*method|password.*reset/i,
  /privilege|group|role|admin/i,
  /device_security_.*disable/i,
  /firewall.*off|vpn.*bypass|edr.*(remove|disable|exclusion)/i,
  /file.*delet/i,
  /software.*install/i,
  /display.*reset/i,
] as const;

export function isDenylisted(
  capabilityId: string,
  definition?: Pick<CapabilityDefinition, "rollback" | "sideEffects">
): boolean {
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
