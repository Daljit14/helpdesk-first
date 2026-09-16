import type { createAdminClient } from "@/lib/supabase/admin";
import latest from "@/docs/eval/latest.json";
import {
  getPilotCapabilityAllowlist,
  getPilotOrgAllowlist,
  guardrailsEnforced,
  isAutonomousExecutionEnabled,
} from "@/lib/autonomy/config";
import { listCapabilities } from "@/lib/autonomy/capabilities/registry";
import { readKillSwitches } from "@/lib/autonomy/kill-switches";
import { isAlertingConfigured } from "@/lib/autonomy/alerts";
import { BENCHMARK_VERSION } from "@/lib/autonomy/eval/benchmark/version";

type Admin = ReturnType<typeof createAdminClient>;

export type PilotReadinessItem = {
  label: string;
  ready: boolean;
  reason: string;
};

export type PilotReadiness = {
  items: PilotReadinessItem[];
  ready: boolean;
  verdict: string;
  executionEnabled: boolean;
};

export async function computePilotReadiness(
  admin: Admin,
  organizationId: string
): Promise<PilotReadiness> {
  const orgAllowlist = getPilotOrgAllowlist();
  const capabilityAllowlist = getPilotCapabilityAllowlist();
  const enabledCapabilities = listCapabilities().map(
    (capability) => capability.id
  );
  const capabilitySubset =
    capabilityAllowlist === null ||
    capabilityAllowlist.every((id) => enabledCapabilities.includes(id));
  const [switches, breakers, tables] = await Promise.all([
    readKillSwitches(admin, organizationId),
    admin
      .from("capability_breakers")
      .select("state")
      .eq("organization_id", organizationId),
    Promise.all(
      ["pilot_reviews", "shadow_decisions", "resolution_events"].map(
        async (table) => {
          const result = await admin.from(table).select("id", { head: true });
          return !result.error;
        }
      )
    ),
  ]);
  const items: PilotReadinessItem[] = [
    {
      label: "Guardrails enforced",
      ready: guardrailsEnforced(),
      reason: "HELP_DESK_GUARDRAILS_ENFORCED must not be false.",
    },
    {
      label: "Organization allow-list",
      ready: orgAllowlist.length > 0 && orgAllowlist.includes(organizationId),
      reason: "The current organization must be explicitly allow-listed.",
    },
    {
      label: "Capability allow-list",
      ready: capabilitySubset,
      reason: "Every pilot capability must exist in the registry.",
    },
    {
      label: "Pilot tables",
      ready: tables.every(Boolean),
      reason:
        "Pilot reviews, shadow decisions, and guardrail events must exist.",
    },
    {
      label: "Breaker closed",
      ready:
        !breakers.error &&
        (breakers.data ?? []).every(
          (row: { state?: unknown }) => row.state !== "open"
        ),
      reason: "Every organization capability breaker must be closed.",
    },
    {
      label: "Organization kill switch off",
      ready: !switches.organization,
      reason: "An organization kill switch pauses the pilot.",
    },
    {
      label: "Alert email configured",
      ready: isAlertingConfigured(),
      reason: "BREVO_API_KEY and NOTIFICATIONS_FROM_EMAIL are required.",
    },
    {
      label: "Latest benchmark report",
      ready:
        latest.version === BENCHMARK_VERSION &&
        latest.gatesPassed === latest.gatesTotal,
      reason: `The latest report must be ${BENCHMARK_VERSION} with all gates passing.`,
    },
  ];
  const blockers = items.filter((item) => !item.ready).length;
  return {
    items,
    ready: blockers === 0,
    verdict:
      blockers === 0
        ? "Ready to enable"
        : `Not ready (${blockers} ${blockers === 1 ? "blocker" : "blockers"})`,
    executionEnabled: isAutonomousExecutionEnabled(),
  };
}
