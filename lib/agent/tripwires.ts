export type TripwireKind =
  | "other_user_target"
  | "weaken_security"
  | "bypass_mfa"
  | "impersonation"
  | "urgency_sensitive"
  | "secret_request"
  | "repeated_identity_failure"
  | "injection_in_tool_output"
  | "model_proposed_denylisted";

const patterns: Array<[TripwireKind, RegExp]> = [
  ["other_user_target", /for (my|a) (colleague|boss|manager|coworker)/i],
  [
    "weaken_security",
    /(disable|turn off|stop) (defender|antivirus|firewall|edr|vpn)/i,
  ],
  ["bypass_mfa", /(bypass|skip|reset).{0,20}(mfa|2fa|verification)/i],
  ["impersonation", /this is (the )?(it|helpdesk|ceo|cto|manager)/i],
  [
    "urgency_sensitive",
    /(urgent|asap|immediately).{0,80}(password|mfa|admin|unlock)/i,
  ],
  [
    "secret_request",
    /(reveal|show|give me).{0,30}(token|secret|api key|password)/i,
  ],
];

export function detectTripwire(userMessage: string): TripwireKind | null {
  return patterns.find(([, pattern]) => pattern.test(userMessage))?.[0] ?? null;
}
