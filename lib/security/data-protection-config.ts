export function isOrgEncryptionEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.HELP_DESK_ORG_ENCRYPTION_ENABLED === "true";
}

export function getMasterKeyId(env: NodeJS.ProcessEnv = process.env): string {
  return env.HELP_DESK_MASTER_KEY_ID?.trim() || "v1";
}
