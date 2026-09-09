import type { Hypothesis, InvestigationContext, StepRef } from "@/lib/ai/types";

export type InvestigationRow = {
  ticket_id: string;
  organization_id: string | null;
  user_id: string;
  context: InvestigationContext;
  hypotheses: Hypothesis[];
  excluded_steps: StepRef[];
  status: "open" | "escalated" | "resolved";
  escalation_package: import("./escalation").EscalationPackage | null;
  escalation_package_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestigationTurnRow = {
  id: number;
  ticket_id: string;
  organization_id: string | null;
  decision: "match" | "clarify" | "escalate";
  confidence: number | null;
  matched_issue_slug: string | null;
  question_ids: string[];
  hypotheses: Hypothesis[];
  next_steps: StepRef[];
  withheld_steps: StepRef[];
  provider: string;
  model: string | null;
  created_at: string;
};
