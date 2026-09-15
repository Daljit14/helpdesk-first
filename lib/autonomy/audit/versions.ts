import { getPlannerProvider } from "../config";
import { PLANNER_PROMPT_VERSION } from "../planner/model-planner";
import { POLICY_VERSION } from "../policy/types";
import { GUARDRAIL_VERSION } from "../guardrails/version";
import { VERIFIER_VERSION } from "../verification/verifiers";

export type AuditVersions = {
  guardrail: string;
  planner: string;
  model: string | null;
  prompt: string;
  capability: string | null;
  policy: string;
  verifier: string;
};

export function auditVersions(
  capability?: { id: string; version: number } | null
): AuditVersions {
  return {
    guardrail: GUARDRAIL_VERSION,
    planner: getPlannerProvider(),
    model: process.env.HELP_DESK_PLANNER_MODEL?.trim() || null,
    prompt: PLANNER_PROMPT_VERSION,
    capability: capability ? `${capability.id}@${capability.version}` : null,
    policy: POLICY_VERSION,
    verifier: VERIFIER_VERSION,
  };
}

export type InitiatedBy = "ai" | "cron" | `user:${string}` | `staff:${string}`;

export function initiatedBy(actor: string): InitiatedBy {
  if (actor.startsWith("user:")) return actor as `user:${string}`;
  if (actor.startsWith("staff:")) return actor as `staff:${string}`;
  if (actor === "cron" || actor === "reaper") return "cron";
  return "ai";
}
