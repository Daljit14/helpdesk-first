import { createAdminClient } from "@/lib/supabase/admin";
import type { ProviderCallTelemetry } from "./anthropic-provider";

export function recordProviderCall(telemetry: ProviderCallTelemetry): void {
  void (async () => {
    try {
      await createAdminClient()
        .from("ai_provider_calls")
        .insert({
          organization_id: telemetry.organizationId ?? null,
          provider: telemetry.provider,
          model: telemetry.model,
          outcome: telemetry.outcome,
          latency_ms: telemetry.latencyMs ?? null,
          input_tokens: telemetry.inputTokens ?? null,
          output_tokens: telemetry.outputTokens ?? null,
          shadow_agree_decision: telemetry.shadowAgreeDecision ?? null,
          shadow_agree_slug: telemetry.shadowAgreeSlug ?? null,
        });
    } catch {
      // Telemetry must never affect intake.
    }
  })();
}
