import { getAiModel, getAiProviderKind } from "./config";
import { AnthropicAiProvider, buildCatalog } from "./anthropic-provider";
import { checkAndConsumeDailyBudget } from "./budget";
import { createAiProvider } from "./mock-provider";
import { ShadowAiProvider } from "./shadow-provider";
import { recordProviderCall } from "./telemetry";
import type { AiProvider } from "./types";

let warnedMissingAnthropicKey = false;

function budgeted(provider: AiProvider): AiProvider {
  return {
    async classify(input, options) {
      if (!(await checkAndConsumeDailyBudget())) {
        recordProviderCall({
          provider: "anthropic",
          model: getAiModel(),
          outcome: "budget",
        });
        throw new Error("AI daily call budget exhausted.");
      }
      return provider.classify(input, options);
    },
  };
}

export function createConfiguredAiProvider(opts?: {
  allowedSlugs?: string[];
  organizationId?: string | null;
}): AiProvider {
  const kind = getAiProviderKind();
  const model = getAiModel();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const catalog = buildCatalog(opts?.allowedSlugs);
  const anthropic = apiKey
    ? budgeted(
        new AnthropicAiProvider({
          apiKey,
          model,
          catalog,
          onCall: (telemetry) =>
            recordProviderCall({
              ...telemetry,
              organizationId: opts?.organizationId,
            }),
        })
      )
    : null;

  if ((kind === "anthropic" || kind === "shadow") && !apiKey) {
    if (!warnedMissingAnthropicKey) {
      warnedMissingAnthropicKey = true;
      console.warn(
        "Anthropic AI provider requested without ANTHROPIC_API_KEY; using mock provider."
      );
    }
  }

  const mock = createAiProvider();
  if (kind === "anthropic") return anthropic ?? mock;
  if (kind === "shadow") {
    return new ShadowAiProvider(mock, anthropic ?? mock, (comparison) => {
      recordProviderCall({
        provider: "shadow",
        model,
        outcome: comparison.shadowError ? "error" : "ok",
        organizationId: opts?.organizationId,
        shadowAgreeDecision: comparison.agreeDecision,
        shadowAgreeSlug: comparison.agreeSlug,
      });
    });
  }
  return mock;
}
