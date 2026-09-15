import type { createAdminClient } from "@/lib/supabase/admin";

export type HandlerAdmin = ReturnType<typeof createAdminClient>;

export type HandlerContext = {
  admin: HandlerAdmin;
  organizationId: string;
  ticketId: string;
  runId: string;
  stepId: string;
  signal: AbortSignal;
  actor: string;
  escalate: (reason: string) => Promise<void>;
};

export type HandlerResult = {
  ok: boolean;
  output: Record<string, string | number | boolean | null>;
  evidenceRefs?: string[];
  error?: string;
};

export type CapabilityHandler<P = Record<string, unknown>> = {
  capabilityId: string;
  version: number;
  run: (ctx: HandlerContext, params: P) => Promise<HandlerResult>;
};
