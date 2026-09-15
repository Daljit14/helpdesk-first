import type { createAdminClient } from "@/lib/supabase/admin";

export type RollbackAdmin = ReturnType<typeof createAdminClient>;

export type RollbackContext = {
  admin: RollbackAdmin;
  organizationId: string;
  ticketId: string;
  runId: string;
  executionId: string;
  parameters: Record<string, unknown>;
  signal: AbortSignal;
};

export type RollbackResult = {
  ok: boolean;
  output: Record<string, string | number | boolean | null>;
  error?: string;
};

export type RollbackHandler = {
  capabilityId: string;
  version: number;
  method: "compensating" | `handler:${string}`;
  run: (context: RollbackContext) => Promise<RollbackResult>;
};
