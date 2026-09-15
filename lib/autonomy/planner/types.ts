import type { EvidenceRecord } from "@/lib/evidence/types";

export type AllowedCapability = {
  id: string;
  version: number;
  description: string;
  inputSchemaJson: unknown;
};

export type PriorAttempt = {
  capabilityId: string;
  version: number;
  status: "succeeded" | "failed" | "timed_out";
};

export type PlannerInput = {
  evidence: EvidenceRecord | null;
  ticket: {
    id: string;
    category: string | null;
    platform: string | null;
    context?: { failedNotificationId?: string };
  };
  allowedCapabilities: AllowedCapability[];
  priorAttempts: PriorAttempt[];
};

export interface Planner {
  readonly id: string;
  readonly version: string;
  plan(input: PlannerInput, signal: AbortSignal): Promise<unknown>;
}
