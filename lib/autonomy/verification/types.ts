import type { createAdminClient } from "@/lib/supabase/admin";

export type VerifierAdmin = ReturnType<typeof createAdminClient>;

export type VerificationOutcome = "passed" | "failed" | "inconclusive";

export type VerifierEvidence = Record<string, string | number | boolean | null>;

export type VerifierContext = {
  admin: VerifierAdmin;
  organizationId: string;
  ticketId: string;
  runId: string;
  executionId: string | null;
  parameters: Record<string, unknown>;
  signal: AbortSignal;
};

export type VerifierResult = {
  outcome: VerificationOutcome;
  evidence: VerifierEvidence;
  /**
   * True when the capability claims to fix the user's problem, so objective
   * evidence must be confirmed by the requester before the run can resolve.
   */
  userConfirmationRequired: boolean;
};

export interface Verifier {
  readonly method: string;
  readonly version: string;
  verify(ctx: VerifierContext): Promise<VerifierResult>;
}
