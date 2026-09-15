import { guardrailsEnforced, isAutonomousExecutionEnabled } from "../config";

export class GuardrailConfigurationError extends Error {
  constructor() {
    super("Autonomous execution requires HELP_DESK_GUARDRAILS_ENFORCED=true.");
    this.name = "GuardrailConfigurationError";
  }
}

export function assertGuardrailsEnforced(): void {
  if (isAutonomousExecutionEnabled() && !guardrailsEnforced()) {
    throw new GuardrailConfigurationError();
  }
}
