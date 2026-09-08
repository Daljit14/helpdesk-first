export function isAdminDashboardEnabled(): boolean {
  return process.env.HELP_DESK_ADMIN_DASHBOARD_ENABLED === "true";
}

export function isResolutionTrackingEnabled(): boolean {
  return process.env.HELP_DESK_RESOLUTION_TRACKING_ENABLED === "true";
}

export function isTicketWorkflowEnabled(): boolean {
  return process.env.HELP_DESK_TICKET_WORKFLOW_ENABLED === "true";
}

export function isKnowledgeGovernanceEnabled(): boolean {
  return process.env.HELP_DESK_KNOWLEDGE_GOVERNANCE_ENABLED === "true";
}

export function isSecureAttachmentsEnabled(): boolean {
  return process.env.HELP_DESK_SECURE_ATTACHMENTS_ENABLED === "true";
}
export function isUserPortalEnabled(): boolean {
  return process.env.HELP_DESK_USER_PORTAL_ENABLED === "true";
}

export function isNotificationsEnabled(): boolean {
  return process.env.HELP_DESK_NOTIFICATIONS_ENABLED === "true";
}

export function isGoogleSsoEnabled(): boolean {
  return process.env.HELP_DESK_SSO_GOOGLE_ENABLED === "true";
}

export function isMicrosoftSsoEnabled(): boolean {
  return process.env.HELP_DESK_SSO_MICROSOFT_ENABLED === "true";
}
