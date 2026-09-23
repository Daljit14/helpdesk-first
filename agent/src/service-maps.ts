export const SERVICE_NAMES = [
  "vpn",
  "sso_helper",
  "print_spooler",
  "windows_update",
  "defender",
] as const;

export type ServiceName = (typeof SERVICE_NAMES)[number];

export const WINDOWS_SERVICE_COMMANDS: Record<ServiceName, string> = {
  vpn: "RasMan",
  sso_helper: "sso_helper",
  print_spooler: "Spooler",
  windows_update: "wuauserv",
  defender: "WinDefend",
};

export const MACOS_SERVICE_COMMANDS: Partial<Record<ServiceName, string>> = {
  print_spooler: "org.cups.cupsd",
};

export const LINUX_SERVICE_COMMANDS: Partial<Record<ServiceName, string>> = {
  vpn: "openvpn",
  print_spooler: "cups",
  sso_helper: "sssd",
};
