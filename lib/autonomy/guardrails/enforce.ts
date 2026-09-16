import {
  getPilotOrgAllowlist,
  guardrailsEnforced,
  isAutonomousExecutionEnabled,
} from "../config";
import { isConnectorKeyValid } from "@/lib/security/connector-key";

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
  const identityCapabilities = [
    "check_account_status",
    "send_password_reset_link",
    "revoke_user_sessions",
    "verify_group_access",
    "grant_group_access",
    "check_sso_health",
  ];
  if (
    isAutonomousExecutionEnabled() &&
    identityCapabilities.some(
      (id) =>
        process.env[`HELP_DESK_CAP_${id.toUpperCase()}_ENABLED`] === "true"
    ) &&
    !isConnectorKeyValid()
  ) {
    throw new PilotConfigurationError();
  }
}
