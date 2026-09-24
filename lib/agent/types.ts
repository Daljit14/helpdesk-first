import type { createAdminClient } from "@/lib/supabase/admin";

export type AgentEvent =
  | { type: "session"; sessionId: string }
  | { type: "thinking_summary"; text: string }
  | { type: "tool_started"; tool: string }
  | { type: "tool_result_summary"; tool: string; summary: string }
  | { type: "action_proposed"; text: string }
  | { type: "consent_required"; text: string }
  | { type: "action_executing"; text: string }
  | { type: "verification_result"; text: string }
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
  status: "active" | "resolved" | "escalated" | "abandoned" | "halted";
  started_at: string;
  ended_at: string | null;
  last_user_message: string | null;
  resolution_summary: string | null;
  escalation_ticket_id: string | null;
  action_count: number;
  tool_call_count: number;
  model_turn_count: number;
  token_count: number;
  halt_reason: string | null;
  security_flag: boolean;
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
