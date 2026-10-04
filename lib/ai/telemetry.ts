import { createAdminClient } from "@/lib/supabase/admin";
import type { ProviderCallTelemetry } from "./anthropic-provider";
import type { ModelUsage } from "./pricing";

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

export function recordAgentModelCall(input: {
  organizationId: string;
  model: string;
  route: "agent_default" | "agent_planner";
  usage: ModelUsage;
  costMicros: number;
}): void {
  if (!input.model.startsWith("claude-")) return;
  void (async () => {
    try {
      await createAdminClient().from("ai_provider_calls").insert({
        organization_id: input.organizationId,
        provider: "anthropic",
        model: input.model,
        outcome: "ok",
        input_tokens: input.usage.inputTokens,
        output_tokens: input.usage.outputTokens,
        cache_read_tokens: input.usage.cacheReadInputTokens,
        cache_write_tokens: input.usage.cacheCreationInputTokens,
        cost_micros: input.costMicros,
        route: input.route,
      });
    } catch {
      // Telemetry must never affect intake.
    }
  })();
}
