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

export function isKnowledgeLearningEnabled(): boolean {
  return process.env.HELP_DESK_KNOWLEDGE_LEARNING_ENABLED === "true";
}

export function isKnowledgeHealthEnabled(): boolean {
  return process.env.HELP_DESK_KNOWLEDGE_HEALTH_ENABLED === "true";
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

export function isInvestigationEnabled(): boolean {
  return process.env.HELP_DESK_INVESTIGATION_ENABLED === "true";
}

export function isStepPolicyEnabled(): boolean {
  return process.env.HELP_DESK_STEP_POLICY_ENABLED === "true";
}

export function isEscalationPackageEnabled(): boolean {
  return process.env.HELP_DESK_ESCALATION_PACKAGE_ENABLED === "true";
}

export function isEvidenceEngineEnabled(): boolean {
  return process.env.HELP_DESK_EVIDENCE_ENGINE_ENABLED === "true";
}

export function isCapabilityRegistryEnabled(): boolean {
  return process.env.HELP_DESK_CAPABILITY_REGISTRY_ENABLED === "true";
}

export function isResolutionCenterEnabled(): boolean {
  return process.env.HELP_DESK_RESOLUTION_CENTER_ENABLED === "true";
}

export function isShadowModeEnabled(): boolean {
  return process.env.HELP_DESK_SHADOW_MODE_ENABLED === "true";
}

export function isResearchEnabled(): boolean {
  return process.env.HELP_DESK_RESEARCH_ENABLED === "true";
}

export function isOrgEncryptionEnabled(): boolean {
  return process.env.HELP_DESK_ORG_ENCRYPTION_ENABLED === "true";
}
