export const LEGACY_SLUG_ALIASES: Record<string, string> = {
  "computer-will-not-start": "computer-wont-start",
  "blue-screen-unexpected-restart": "blue-screen",
  "no-internet-connection": "no-internet",
  "wi-fi-keeps-disconnecting": "wifi-disconnecting",
  "vpn-connection-problem": "vpn-problem",
  "printer-showing-offline": "printer-offline",
  "email-sign-in-problem": "email-sign-in",
  "application-will-not-open": "app-wont-open",
  "software-installation-problem": "install-problem",
  "application-frozen": "app-frozen",
  "wrong-default-application": "wrong-default-app",
  "camera-or-microphone-not-working": "camera-mic-not-working",
  "microphone-not-working": "mic-not-working",
  "bluetooth-headset-problem": "bluetooth-headset",
  "screen-sharing-problem": "screen-sharing",
};

export function resolveIssueId(slug: string): string {
  return LEGACY_SLUG_ALIASES[slug] ?? slug;
}
