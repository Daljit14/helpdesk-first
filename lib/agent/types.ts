import type { createAdminClient } from "@/lib/supabase/admin";

export type ConsentCard = {
  approvalRequestId: string;
  capabilityId: string;
  title: string;
  whatHappens: string;
  target: { kind: "device" | "account"; label: string };
  reversible: boolean;
  expiresAt: string;
};

export type AgentEvent =
  | { type: "session"; sessionId: string }
  | { type: "thinking_summary"; text: string }
  | { type: "tool_started"; tool: string }
  | { type: "tool_result_summary"; tool: string; summary: string }
  | { type: "action_proposed"; capabilityId: string; text: string }
  | { type: "consent_required"; card: ConsentCard }
  | { type: "consent_declined"; capabilityId: string }
  | { type: "action_executing"; capabilityId: string; text: string }
  | {
      type: "verification_result";
      status: "passed" | "failed" | "inconclusive";
      rollback: "none" | "succeeded" | "failed" | "unsupported";
      text: string;
    }
  | { type: "confirm_required"; text: string }
  | { type: "resolved"; text: string }
  | {
      type: "final_answer";
      text: string;
      confidence: number;
      evidence: string[];
    }
  | { type: "escalated"; ticketId: string; reason: string }
  | { type: "error"; message: string }
  | { type: "halted"; reason: string; ticketId?: string };

export type AgentSession = {
  id: string;
  organization_id: string;
  requester_id: string;
  platform?: string | null;
  status: "active" | "resolved" | "escalated" | "abandoned" | "halted";
  started_at: string;
  ended_at: string | null;
  last_user_message: string | null;
  resolution_summary: string | null;
  escalation_ticket_id: string | null;
  backing_ticket_id?: string | null;
  resolution_run_id?: string | null;
  pending_approval_id?: string | null;
  action_count: number;
  failed_hypotheses?: number;
  tool_call_count: number;
  model_turn_count: number;
  token_count: number;
  halt_reason: string | null;
  security_flag: boolean;
  verified_execution_id?: string | null;
  user_confirmed_at?: string | null;
  updated_at: string;
};

export type AgentContext = {
  admin: ReturnType<typeof createAdminClient>;
  session: AgentSession;
  requesterId: string;
  organizationId: string;
  platform?: string;
  signal: AbortSignal;
  emit: (event: AgentEvent) => void;
};
