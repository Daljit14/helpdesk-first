export function isInvestigationEnabled(): boolean {
  return process.env.HELP_DESK_INVESTIGATION_ENABLED === "true";
}

export function isStepPolicyEnabled(): boolean {
  return process.env.HELP_DESK_STEP_POLICY_ENABLED === "true";
}

export function isEscalationPackageEnabled(): boolean {
  return process.env.HELP_DESK_ESCALATION_PACKAGE_ENABLED === "true";
}
