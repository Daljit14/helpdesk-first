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
