import { getIssueSteps } from "@/lib/steps";
import type { Issue } from "@/lib/issues";

export type StepRisk =
  "safe" | "caution" | "approval" | "specialist" | "denied";
export type Audience = "requester" | "staff";
export type StepPolicy = {
  guideSlug: string;
  stepIndex: number;
  text: string;
  risk: StepRisk;
  reason: string;
};

export const STEP_RISK_OVERRIDES: Record<string, Record<number, StepRisk>> = {};

type Rule = { risk: StepRisk; reason: string; matches: RegExp };

const safeRules: Rule[] = [
  {
    risk: "safe",
    reason: "matches: advisory or support contact",
    matches:
      /^(?:if\b[^.]*,\s*)?(?:contact|ask|report (?:it|the alert|the message) to|tell)\b.*\b(?:it|support|help ?desk|supplier|provider)\b/i,
  },
];

const advisoryImperativeActions =
  /\b(?:bypass|disable|flash|regedit|powershell|terminal|command)\b/i;

const deniedRules: Rule[] = [
  {
    risk: "denied",
    reason: "matches: password or authentication bypass",
    matches:
      /\b(?:bypass|circumvent)\b.*\b(?:password|mfa|2fa|authentication|login|lock)\b/i,
  },
  {
    risk: "denied",
    reason: "matches: security protection disablement",
    matches:
      /\b(?:disable|turn off)\b.*\b(?:antivirus|firewall|defender|security|protection|encryption|bitlocker)\b/i,
  },
  {
    risk: "denied",
    reason: "matches: registry editing",
    matches: /\b(?:regedit|registry editor|registry)\b/i,
  },
  {
    risk: "denied",
    reason: "matches: arbitrary command execution",
    matches:
      /\b(?:cmd\.exe|powershell|terminal|command prompt|command line|shell|sudo)\b|\brun\s+(?:arbitrary|the)\s+command\b/i,
  },
  {
    risk: "denied",
    reason: "matches: cracking or piracy",
    matches: /\b(?:crack|keygen|pirat(?:e|ed|ing))\b/i,
  },
];

const specialistRules: Rule[] = [
  {
    risk: "specialist",
    reason: "matches: BIOS or firmware flashing",
    matches: /\b(?:bios|uefi|firmware)\b|\bflash(?:ing)?\b/i,
  },
  {
    risk: "specialist",
    reason: "matches: manual malware removal",
    matches:
      /\b(?:remove|delete|manually\s+remove|clean|quarantine)\b.*\b(?:malware|ransomware|virus|trojan)\b|\b(?:malware|ransomware|virus|trojan)\b.*\b(?:remove|delete|manually)\b/i,
  },
  {
    risk: "specialist",
    reason: "matches: data recovery",
    matches:
      /\bdata recovery\b|\brecover\b.*\b(?:deleted|lost|corrupt)\b.*\b(?:drive|disk|partition)\b/i,
  },
  {
    risk: "specialist",
    reason: "matches: disk repair or formatting",
    matches: /\bchkdsk\b.*\brepair\b|\bformat\b\s+(?:the\s+)?(?:drive|disk)\b/i,
  },
];

const approvalRules: Rule[] = [
  {
    risk: "approval",
    reason: "matches: DNS or network settings",
    matches:
      /\bdns\b|\bip address\b|\bproxy\b|\bvpn server\b|\bgateway settings\b/i,
  },
  {
    risk: "approval",
    reason: "matches: system file repair",
    matches: /\bsfc\b|\bdism\b|\bsystem file check\b/i,
  },
  {
    risk: "approval",
    reason: "matches: software installation",
    matches:
      /\b(?:install|installing)\b(?!\s+(?:pending|the latest|available|system|operating|os|updates?|it from the app store))\b/i,
  },
  {
    risk: "approval",
    reason: "matches: software removal or replacement",
    matches: /\b(?:reinstall|uninstall)\b/i,
  },
  {
    risk: "approval",
    reason: "matches: driver or safe mode",
    matches:
      /\b(?:update|install|reinstall|roll back|uninstall)\b.*\bdriver\b|\bsafe mode\b/i,
  },
  {
    risk: "approval",
    reason: "matches: administrator privileges",
    matches: /\badministrator\b|\badmin account\b|\belevated\b/i,
  },
  {
    risk: "approval",
    reason: "matches: group policy change",
    matches: /\bgroup policy\b|\bpolicy\b.*\b(?:change|edit)\b/i,
  },
  {
    risk: "approval",
    reason: "matches: server or security settings",
    matches: /\bchange\b.*\b(?:server|network|security)\s+settings\b/i,
  },
  {
    risk: "approval",
    reason: "matches: domain membership change",
    matches: /\b(?:join|leave)\b\s+(?:the\s+)?domain\b/i,
  },
  {
    risk: "approval",
    reason: "matches: factory reset",
    matches: /\bfactory reset\b/i,
  },
];

const driverUpdateCautionRule: Rule = {
  risk: "caution",
  reason: "matches: checking for driver updates",
  matches: /\bcheck for\b.*\bdriver updates?\b/i,
};

const cautionRules: Rule[] = [
  {
    risk: "caution",
    reason: "matches: temporary files or cache cleanup",
    matches:
      /^\s*(?:[^.]*\band\b\s+)?clear\b.*\b(?:temporary|temp|cache|cookies|browsing)\b/i,
  },
  {
    risk: "caution",
    reason: "matches: installer download or handling",
    matches: /\binstaller\b/i,
  },
  {
    risk: "caution",
    reason: "matches: file or device removal",
    matches:
      /\b(?:delete|remove)\b.*\b(?:files|downloads|account|device|headset|printer)\b/i,
  },
  {
    risk: "caution",
    reason: "matches: force quit or task termination",
    matches: /\b(?:force[- ]quit|end task|kill)\b/i,
  },
  {
    risk: "caution",
    reason: "matches: hard reset or power cycle",
    matches: /\b(?:hold the power button|hard reset|power cycle|unplug)\b/i,
  },
  {
    risk: "caution",
    reason: "matches: network or settings reset",
    matches:
      /\bforget the network\b|\breset\b.*\b(?:network|the app|settings)\b/i,
  },
  {
    risk: "caution",
    reason: "matches: startup or background disablement",
    matches: /\bdisable\b.*\b(?:startup|background|extensions|items)\b/i,
  },
];

function isUpdateInstallation(text: string): boolean {
  return (
    /\binstall\w*\b.*\bupdates?\b/i.test(text) ||
    /\bupdates?\b.*\binstall(?:ed|ing|ation)?\b/i.test(text)
  );
}

export function classifyStep(text: string): { risk: StepRisk; reason: string } {
  const normalized = text.toLowerCase();
  for (const rule of safeRules) {
    if (
      rule.matches.test(normalized) &&
      !advisoryImperativeActions.test(normalized)
    ) {
      return rule;
    }
  }
  for (const rule of deniedRules) {
    if (rule.matches.test(normalized)) return rule;
  }
  for (const rule of specialistRules) {
    if (rule.matches.test(normalized)) return rule;
  }
  if (driverUpdateCautionRule.matches.test(normalized)) {
    return driverUpdateCautionRule;
  }
  if (!isUpdateInstallation(normalized)) {
    for (const rule of approvalRules) {
      if (rule.matches.test(normalized)) return rule;
    }
  }
  for (const rule of cautionRules) {
    if (rule.matches.test(normalized)) return rule;
  }
  return { risk: "safe", reason: "no elevated risk rule matched" };
}

export function getIssueStepPolicies(issue: Issue): StepPolicy[] {
  return getIssueSteps(issue).map((text, stepIndex) => {
    const override = STEP_RISK_OVERRIDES[issue.id]?.[stepIndex];
    const classification = override
      ? {
          risk: override,
          reason: "matches: curated policy override",
        }
      : classifyStep(text);
    return {
      guideSlug: issue.id,
      stepIndex,
      text,
      ...classification,
    };
  });
}

export function isOfferable(risk: StepRisk, audience: Audience): boolean {
  if (audience === "requester") return risk === "safe" || risk === "caution";
  return risk === "safe" || risk === "caution" || risk === "approval";
}

export function riskLabel(risk: StepRisk): string {
  switch (risk) {
    case "safe":
      return "Safe";
    case "caution":
      return "Confirm first";
    case "approval":
      return "Requires IT approval";
    case "specialist":
      return "Specialist only";
    case "denied":
      return "Not allowed";
  }
}
