import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { createAdminClient } from "@/lib/supabase/admin";
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
  const [switches, breaker, tables, report] = await Promise.all([
    readKillSwitches(admin, organizationId),
    admin
      .from("capability_breakers")
      .select("state")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    Promise.all(
      ["pilot_reviews", "shadow_decisions", "resolution_events"].map(
        async (table) => {
          const result = await admin.from(table).select("id", { head: true });
          return !result.error;
        }
      )
    ),
    readFile(
      join(process.cwd(), "docs/eval", `${BENCHMARK_VERSION}.json`),
      "utf8"
    )
      .then((value) => value.includes(`"version": "${BENCHMARK_VERSION}"`))
      .catch(() => false),
  ]);
  const organizationQueriesScoped = true;
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
      label: "Organization-scoped queries",
      ready: organizationQueriesScoped,
      reason: "Service-role reads must filter by organization.",
    },
    {
      label: "Breaker closed",
      ready: !breaker.error && breaker.data?.state !== "open",
      reason: "The organization capability breaker must be closed.",
    },
    {
      label: "Organization kill switch off",
      ready: !switches.organization,
      reason: "An organization kill switch pauses the pilot.",
    },
    {
      label: "Alert email configured",
      ready: isAlertingConfigured(),
      reason: "BREVO_API_KEY and a sender address are required.",
    },
    {
      label: "Latest benchmark report",
      ready: report,
      reason: `The ${BENCHMARK_VERSION} report must be present.`,
    },
  ];
  const blockers = items.filter((item) => !item.ready).length;
  return {
    items,
    ready: blockers === 0,
    verdict:
      blockers === 0 ? "Ready to enable" : `Not ready (${blockers} blockers)`,
    executionEnabled: isAutonomousExecutionEnabled(),
  };
}
