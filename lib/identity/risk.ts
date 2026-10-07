import type { CapabilityDefinition } from "@/lib/autonomy/capabilities/types";
import { requiredAssurance } from "@/lib/autonomy/capabilities/registry";
import { OTHER_USER_TARGET } from "@/lib/agent/tripwires";
import { OTHER_ACCOUNT } from "@/lib/answers/step-safety";
import type { AssuranceFacts } from "./assurance";

export type RiskReason =
  | "repeat_account_request_24h"
  | "mfa_changed_7d"
  | "new_sign_in_country"
  | "impossible_travel"
  | "new_device_24h"
  | "names_other_person"
  | "privileged_account"
  | "risk_unavailable";

export type RiskLevel = "none" | "elevated" | "high";

export type AccountRiskFacts = {
  priorAccountRequests24h: number | null;
  mfaChangedAt: string | null;
  signIns: { at: string; country: string }[];
  newestDeviceEnrolledAt: string | null;
  namesOtherPerson: boolean;
  privileged: boolean | null;
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function withinPast(
  value: string | null,
  nowMs: number,
  durationMs: number
): boolean {
  const valueMs = timestamp(value);
  return valueMs !== null && valueMs <= nowMs && valueMs >= nowMs - durationMs;
}

function signInWindows(
  signIns: AccountRiskFacts["signIns"],
  nowMs: number
): {
  recent: { at: number; country: string }[];
  older: { at: number; country: string }[];
} {
  const recent: { at: number; country: string }[] = [];
  const older: { at: number; country: string }[] = [];
  for (const signIn of signIns) {
    const at = Date.parse(signIn.at);
    if (!Number.isFinite(at) || at > nowMs || at < nowMs - MONTH_MS) continue;
    const country = signIn.country.trim().toUpperCase();
    if (!country) continue;
    if (at >= nowMs - DAY_MS) recent.push({ at, country });
    else older.push({ at, country });
  }
  return { recent, older };
}

export function assessAccountRisk(input: {
  facts: AccountRiskFacts;
  now: Date;
}): { level: RiskLevel; reasons: RiskReason[] } {
  const { facts, now } = input;
  const nowMs = now.getTime();
  const reasons: RiskReason[] = [];
  const hasRepeatRequest =
    facts.priorAccountRequests24h !== null &&
    facts.priorAccountRequests24h >= 1;
  if (hasRepeatRequest) reasons.push("repeat_account_request_24h");

  const mfaChanged = withinPast(facts.mfaChangedAt, nowMs, WEEK_MS);
  if (mfaChanged) reasons.push("mfa_changed_7d");

  const { recent, older } = signInWindows(facts.signIns, nowMs);
  const newCountry =
    older.length > 0 &&
    recent.some(
      (signIn) => !older.some((previous) => previous.country === signIn.country)
    );
  if (newCountry) reasons.push("new_sign_in_country");

  const impossibleTravel = recent.some((signIn, index) =>
    recent
      .slice(index + 1)
      .some(
        (other) =>
          other.country !== signIn.country &&
          Math.abs(other.at - signIn.at) <= 2 * 60 * 60 * 1_000
      )
  );
  if (impossibleTravel) reasons.push("impossible_travel");

  if (withinPast(facts.newestDeviceEnrolledAt, nowMs, DAY_MS))
    reasons.push("new_device_24h");
  if (facts.namesOtherPerson) reasons.push("names_other_person");
  if (facts.privileged === true) reasons.push("privileged_account");
  if (facts.priorAccountRequests24h === null) reasons.push("risk_unavailable");

  const high =
    hasRepeatRequest ||
    facts.privileged === true ||
    facts.namesOtherPerson ||
    facts.priorAccountRequests24h === null ||
    ((newCountry || impossibleTravel) && mfaChanged);
  if (high) return { level: "high", reasons };
  return { level: reasons.length > 0 ? "elevated" : "none", reasons };
}

export function namesOtherPerson(
  texts: string[],
  requesterEmail: string | null
): boolean {
  const ownEmail = requesterEmail?.trim().toLowerCase() ?? null;
  return texts.some((text) => {
    if (OTHER_ACCOUNT.test(text) || OTHER_USER_TARGET.test(text)) return true;
    const addresses = text.match(new RegExp(EMAIL_ADDRESS.source, "gi")) ?? [];
    return addresses.some((address) => address.toLowerCase() !== ownEmail);
  });
}

export function isAccountCapability(definition: CapabilityDefinition): boolean {
  return (
    definition.requiresIdentityBinding === true &&
    requiredAssurance(definition) === "A3"
  );
}

export function staffAssuranceWithinRun(
  assurance: AssuranceFacts | undefined,
  input: { runCreatedAt: string; now: Date }
): assurance is AssuranceFacts {
  if (!assurance || assurance.level !== "A3") return false;
  const authAt = timestamp(assurance.authAt);
  const expiresAt = timestamp(assurance.expiresAt);
  const runCreatedAt = timestamp(input.runCreatedAt);
  return (
    authAt !== null &&
    expiresAt !== null &&
    runCreatedAt !== null &&
    authAt >= runCreatedAt &&
    authAt <= input.now.getTime() &&
    expiresAt > input.now.getTime()
  );
}
