export const ASSIGNABLE_ROLES = [
  "org_admin",
  "support_agent",
  "platform_admin",
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
