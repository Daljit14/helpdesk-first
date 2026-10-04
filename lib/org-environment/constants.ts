export const mdmProviders = [
  "intune",
  "jamf",
  "kandji",
  "workspace_one",
  "google_endpoint",
  "none",
  "other",
] as const;
export const emailStacks = [
  "microsoft365",
  "google_workspace",
  "other",
] as const;
export const chatStacks = [
  "teams",
  "slack",
  "google_chat",
  "zoom",
  "other",
] as const;
export const ssoProviders = [
  "entra",
  "google",
  "okta",
  "none",
  "other",
] as const;
export const standardPlatforms = [
  "Windows",
  "Mac",
  "iOS",
  "Android",
  "Other",
] as const;
