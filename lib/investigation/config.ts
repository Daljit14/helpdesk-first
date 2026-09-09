export function isInvestigationEnabled(): boolean {
  return process.env.HELP_DESK_INVESTIGATION_ENABLED === "true";
}
