import type { CapabilityDefinition } from "./types";

export const PROHIBITED_PATTERNS: { label: string; pattern: RegExp }[] = [
  {
    label: "arbitrary shell or script execution",
    pattern:
      /\b(shell|bash|zsh|sh\b|cmd\.exe|powershell|pwsh|applescript|osascript|run[_ -]?command|exec(?:ute)?[_ -]?(?:script|command))\b/i,
  },
  {
    label: "free-text SQL",
    pattern: /\b(sql|run[_ -]?query|raw[_ -]?query)\b/i,
  },
  { label: "registry editing", pattern: /\b(regedit|registry)\b/i },
  { label: "BIOS or firmware changes", pattern: /\b(bios|uefi|firmware)\b/i },
  {
    label: "password or MFA reset/bypass",
    pattern:
      /\b(reset|bypass|change|disable)[_ -]?(?:the[_ -]?)?(password|passcode|pin|mfa|2fa|otp|multi[_ -]?factor)\b|\b(password|mfa|2fa)[_ -]?(reset|bypass)\b/i,
  },
  {
    label: "malware removal",
    pattern:
      /\b(remove|delete|clean|quarantine)[_ -]?(malware|virus|trojan|ransomware)\b|\bmalware[_ -]?(removal|deletion|cleanup)\b/i,
  },
  {
    label: "data recovery",
    pattern:
      /\b(data|file|disk|drive)[_ -]?(recovery|recover|undelete)\b|\bundelete\b/i,
  },
  {
    label: "remote desktop or control",
    pattern:
      /\b(remote[_ -]?(desktop|control|access|session)|rdp|vnc|teamviewer|anydesk|screen[_ -]?share)\b/i,
  },
  {
    label: "security-tool disabling",
    pattern:
      /\b(disable|stop|turn[_ -]?off|kill)[_ -]?(?:the[_ -]?)?(antivirus|anti[_ -]?virus|defender|firewall|edr|xdr|security[_ -]?(tool|agent|software)|gatekeeper|secure[_ -]?boot)\b/i,
  },
  {
    label: "destructive operations",
    pattern:
      /\b(format|wipe|erase|factory[_ -]?reset|reimage|rm[_ -]?-rf|del[_ -]?\/s|shred|truncate|drop[_ -]?(table|database))\b/i,
  },
];

export function findProhibited(text: string): string | null {
  for (const { label, pattern } of PROHIBITED_PATTERNS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

export function assertNotProhibited(
  def: Pick<CapabilityDefinition, "id" | "description">
): void {
  const hit = findProhibited(`${def.id} ${def.description}`);
  if (hit) {
    throw new Error(
      `Capability "${def.id}" matches a prohibited action category: ${hit}.`
    );
  }
}
