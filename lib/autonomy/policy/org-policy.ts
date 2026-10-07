import { z } from "zod";
import type { AutonomyTier } from "@/lib/autonomy/ladder";

export const ORG_POLICY_TIERS = ["shadow", "consent", "autorun"] as const;
export type OrgPolicyTier = (typeof ORG_POLICY_TIERS)[number];
export type AutorunWindow = {
  days: number[];
  start: string;
  end: string;
  timeZone: string;
};
export type OrgPolicyEffect = "allow" | "deny";

export type OrgActionPolicyRule = {
  id: string;
  capabilityId: string;
  effect: OrgPolicyEffect;
  scopeGroups: string[];
  maxTier: OrgPolicyTier;
  autorunWindows: AutorunWindow[];
  requireStaffApproval: boolean;
};

export type OrgPolicyReason =
  | "org_policy_denied"
  | "org_policy_not_in_scope"
  | "org_policy_groups_unavailable"
  | "org_policy_max_tier"
  | "org_policy_outside_autorun_window"
  | "org_policy_staff_approval";

export type OrgPolicyDecision = {
  allowed: boolean;
  governed: boolean;
  effectiveMaxTier: AutonomyTier;
  requireStaffApproval: boolean;
  reasons: OrgPolicyReason[];
};

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const windowSchema = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    start: timeSchema,
    end: timeSchema,
    timeZone: z.string().min(1).max(100).refine(validTimeZone),
  })
  .strict();

export const orgActionPolicyRuleSchema = z
  .object({
    id: z.string().uuid(),
    capabilityId: z.string().regex(/^(?:\*|[a-z][a-z0-9_]{2,63})$/),
    effect: z.enum(["allow", "deny"]),
    scopeGroups: z.array(z.string().min(1).max(200)).max(20),
    maxTier: z.enum(ORG_POLICY_TIERS),
    autorunWindows: z.array(windowSchema).max(20),
    requireStaffApproval: z.boolean(),
  })
  .strict();

export const orgActionPolicyInputSchema = orgActionPolicyRuleSchema
  .omit({ id: true })
  .extend({ id: z.string().uuid().optional(), note: z.string().max(500) })
  .strict();

const tierOrder: Record<AutonomyTier, number> = {
  disabled: 0,
  shadow: 1,
  consent: 2,
  autorun: 3,
};

function minTier(left: AutonomyTier, right: AutonomyTier): AutonomyTier {
  return tierOrder[left] <= tierOrder[right] ? left : right;
}

function maxPolicyTier(values: OrgPolicyTier[]): OrgPolicyTier {
  return values.reduce(
    (current, value) =>
      tierOrder[value] > tierOrder[current] ? value : current,
    "shadow"
  );
}

function relevantRules(
  rules: readonly OrgActionPolicyRule[],
  capabilityId: string
): OrgActionPolicyRule[] {
  return rules.filter(
    (rule) => rule.capabilityId === capabilityId || rule.capabilityId === "*"
  );
}

function groupMatches(
  rule: OrgActionPolicyRule,
  requesterGroups: readonly string[] | null
): boolean {
  if (rule.scopeGroups.length === 0) return true;
  if (requesterGroups === null) return rule.effect === "deny";
  return rule.scopeGroups.some((group) => requesterGroups.includes(group));
}

const weekdayByShortName: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function minutes(value: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function localClock(
  now: Date,
  timeZone: string
): { day: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value])
    );
    const day = weekdayByShortName[values.weekday ?? ""];
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    if (
      day === undefined ||
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    )
      return null;
    return { day, minute: hour * 60 + minute };
  } catch {
    return null;
  }
}

function windowMatches(window: AutorunWindow, now: Date): boolean {
  const start = minutes(window.start);
  const end = minutes(window.end);
  if (start === null || end === null || start === end) return false;
  const local = localClock(now, window.timeZone);
  if (!local) return false;
  if (start < end)
    return (
      window.days.includes(local.day) &&
      local.minute >= start &&
      local.minute < end
    );
  const previousDay = (local.day + 6) % 7;
  return (
    (window.days.includes(local.day) && local.minute >= start) ||
    (window.days.includes(previousDay) && local.minute < end)
  );
}

function allowTierAt(
  rule: OrgActionPolicyRule,
  now: Date
): { tier: OrgPolicyTier; outsideWindow: boolean } {
  if (rule.maxTier !== "autorun" || rule.autorunWindows.length === 0)
    return { tier: rule.maxTier, outsideWindow: false };
  const inWindow = rule.autorunWindows.some((window) =>
    windowMatches(window, now)
  );
  return inWindow
    ? { tier: "autorun", outsideWindow: false }
    : { tier: "consent", outsideWindow: true };
}

export function evaluateOrgPolicy(input: {
  rules: readonly OrgActionPolicyRule[];
  capabilityId: string;
  requesterGroups: readonly string[] | null;
  tier: AutonomyTier;
  now: Date;
}): OrgPolicyDecision {
  const relevant = relevantRules(input.rules, input.capabilityId);
  const governed = relevant.length > 0;
  const matchingDenies = relevant.filter(
    (rule) =>
      rule.effect === "deny" && groupMatches(rule, input.requesterGroups)
  );
  if (matchingDenies.length > 0) {
    return {
      allowed: false,
      governed,
      effectiveMaxTier: "disabled",
      requireStaffApproval: false,
      reasons: ["org_policy_denied"],
    };
  }

  const allows = relevant.filter((rule) => rule.effect === "allow");
  const matchingAllows = allows.filter((rule) =>
    groupMatches(rule, input.requesterGroups)
  );
  if (allows.length > 0 && matchingAllows.length === 0) {
    return {
      allowed: false,
      governed,
      effectiveMaxTier: "disabled",
      requireStaffApproval: false,
      reasons: [
        "org_policy_not_in_scope",
        ...(input.requesterGroups === null &&
        allows.some((rule) => rule.scopeGroups.length > 0)
          ? ["org_policy_groups_unavailable" as const]
          : []),
      ],
    };
  }
  if (matchingAllows.length === 0) {
    return {
      allowed: true,
      governed,
      effectiveMaxTier: input.tier,
      requireStaffApproval: false,
      reasons: [],
    };
  }

  const capabilityAllows = matchingAllows.filter(
    (rule) => rule.capabilityId === input.capabilityId
  );
  const chosenAllows =
    capabilityAllows.length > 0
      ? capabilityAllows
      : matchingAllows.filter((rule) => rule.capabilityId === "*");
  const tiers = chosenAllows.map((rule) => allowTierAt(rule, input.now));
  const policyTier = maxPolicyTier(tiers.map((value) => value.tier));
  const effectiveMaxTier = minTier(input.tier, policyTier);
  const reasons: OrgPolicyReason[] = [];
  if (tierOrder[policyTier] < tierOrder[input.tier])
    reasons.push("org_policy_max_tier");
  if (tiers.some((value) => value.outsideWindow))
    reasons.push("org_policy_outside_autorun_window");
  const requireStaffApproval = chosenAllows.some(
    (rule) => rule.requireStaffApproval
  );
  if (requireStaffApproval) reasons.push("org_policy_staff_approval");
  return {
    allowed: true,
    governed,
    effectiveMaxTier,
    requireStaffApproval,
    reasons,
  };
}

export function orgPolicyCeiling(
  rules: readonly OrgActionPolicyRule[],
  capabilityId: string
): AutonomyTier {
  const relevant = relevantRules(rules, capabilityId);
  if (
    relevant.some(
      (rule) => rule.effect === "deny" && rule.scopeGroups.length === 0
    )
  )
    return "disabled";
  const allows = relevant.filter((rule) => rule.effect === "allow");
  if (allows.length === 0) return "autorun";
  const specific = allows.filter((rule) => rule.capabilityId === capabilityId);
  const chosen = specific.length > 0 ? specific : allows;
  return maxPolicyTier(chosen.map((rule) => rule.maxTier));
}

function formatDays(days: number[]): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (days.length === 7) return "every day";
  if ([1, 2, 3, 4, 5].every((day) => days.includes(day)) && days.length === 5)
    return "Mon–Fri";
  return days.map((day) => names[day]).join(", ");
}

export function describeOrgPolicy(
  rules: readonly OrgActionPolicyRule[],
  labelFor: (id: string) => string
): string[] {
  return rules.map((rule) => {
    const capability =
      rule.capabilityId === "*" ? "all fixes" : labelFor(rule.capabilityId);
    const groups =
      rule.scopeGroups.length === 0
        ? "everyone"
        : `members of ${rule.scopeGroups.length} group${rule.scopeGroups.length === 1 ? "" : "s"}`;
    if (rule.effect === "deny")
      return `The AI may never ${capability}${rule.scopeGroups.length === 0 ? "." : ` for ${groups}.`}`;
    const windows =
      rule.maxTier === "autorun" && rule.autorunWindows.length > 0
        ? `, on its own only ${rule.autorunWindows
            .map(
              (window) =>
                `${window.start}–${window.end} ${formatDays(window.days)} (${window.timeZone})`
            )
            .join("; ")}`
        : "";
    const tier =
      rule.maxTier === "autorun"
        ? "on its own"
        : rule.maxTier === "consent"
          ? "with requester consent"
          : "in shadow mode";
    const approval = rule.requireStaffApproval
      ? " and only with staff approval"
      : "";
    return `The AI can ${capability} for ${groups}, ${tier}${windows}${approval}.`;
  });
}
