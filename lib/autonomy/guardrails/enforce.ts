import {
  getPilotOrgAllowlist,
  guardrailsEnforced,
  isAutonomousExecutionEnabled,
} from "../config";

export class GuardrailConfigurationError extends Error {
  constructor() {
    super("Autonomous execution requires HELP_DESK_GUARDRAILS_ENFORCED=true.");
    this.name = "GuardrailConfigurationError";
  }
}

export class PilotConfigurationError extends Error {
  constructor() {
    super(
      "Autonomous execution requires a non-empty HELP_DESK_AUTONOMY_ORG_ALLOWLIST."
    );
    this.name = "PilotConfigurationError";
  }
}

export function assertGuardrailsEnforced(): void {
  if (isAutonomousExecutionEnabled() && !guardrailsEnforced()) {
    throw new GuardrailConfigurationError();
  }
  if (isAutonomousExecutionEnabled() && getPilotOrgAllowlist().length === 0) {
    throw new PilotConfigurationError();
  }
}
