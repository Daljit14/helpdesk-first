import { getAgentPlannerModel, getAiModel } from "@/lib/ai/config";
import { isAgentModelRoutingEnabled } from "@/lib/admin/flags";

export type AgentRouteReason =
  "multiple_hypotheses" | "failed_verification" | "screenshot";

export type AgentRouteSignals = {
  evidenceSources: number;
  failedVerification: boolean;
  screenshotAttached: boolean;
};

export type AgentRoute = {
  tier: "default" | "planner";
  model: string;
  reasons: AgentRouteReason[];
};

export function countEvidenceSources(
  evidence: Array<{ tool: string }>
): number {
  return evidence.filter(
    (item) =>
      item.tool !== "search_guides" &&
      item.tool !== "get_org_environment" &&
      item.tool !== "count_similar_org_issues"
  ).length;
}

export function selectAgentRoute(
  signals: AgentRouteSignals,
  env = {
    enabled: isAgentModelRoutingEnabled(),
    plannerModel: getAgentPlannerModel(),
    defaultModel: getAiModel(),
  }
): AgentRoute {
  const reasons: AgentRouteReason[] = [];
  if (signals.evidenceSources >= 2) reasons.push("multiple_hypotheses");
  if (signals.failedVerification) reasons.push("failed_verification");
  if (signals.screenshotAttached) reasons.push("screenshot");
  const tier =
    env.enabled && env.plannerModel && reasons.length > 0
      ? "planner"
      : "default";
  return {
    tier,
    model: tier === "planner" ? env.plannerModel! : env.defaultModel,
    reasons,
  };
}
