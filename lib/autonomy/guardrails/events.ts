import type { createAdminClient } from "@/lib/supabase/admin";
import { auditVersions } from "../audit/versions";
import { redactAuditDetail } from "../audit/redact";
import { GUARDRAIL_VERSION } from "./version";
import { writeRunEvent, type ResolutionRun } from "../orchestrator";

export const GUARDRAIL_EVENT_KINDS = [
  "guardrail.input_redacted",
  "guardrail.prompt_injection_detected",
  "guardrail.output_rejected",
  "guardrail.tenant_mismatch",
  "guardrail.capability_unknown",
  "guardrail.policy_denied",
  "guardrail.consent_required",
  "guardrail.approval_required",
  "guardrail.consent_rejected",
  "guardrail.rate_limited",
  "guardrail.kill_switch_blocked",
  "guardrail.breaker_open",
  "guardrail.verification_missing",
  "guardrail.execution_disabled",
  "guardrail.execution_allowed",
] as const;

export type GuardrailEventKind = (typeof GUARDRAIL_EVENT_KINDS)[number];
type GuardrailAdmin = ReturnType<typeof createAdminClient>;

export async function writeGuardrailEvent(
  admin: GuardrailAdmin,
  input: {
    run: Pick<ResolutionRun, "id" | "organization_id" | "ticket_id">;
    kind: GuardrailEventKind;
    reasonCode: string;
    capability?: { id: string; version: number } | null;
    evidenceRefs?: string[];
    actor: string;
    detail?: Record<string, unknown>;
  }
): Promise<void> {
  await writeRunEvent(admin, {
    organization_id: input.run.organization_id,
    run_id: input.run.id,
    ticket_id: input.run.ticket_id,
    kind: input.kind,
    actor: input.actor,
    detail: {
      ...redactAuditDetail(input.detail ?? {}),
      reasonCode: input.reasonCode,
      guardrailVersion: GUARDRAIL_VERSION,
      policyVersion: auditVersions(input.capability).policy,
      capability: input.capability
        ? `${input.capability.id}@${input.capability.version}`
        : null,
      evidenceRefs: input.evidenceRefs ?? [],
    },
  });
}
