import { getResearchConfig } from "@/lib/autonomy/config";
import { createBraveProvider } from "@/lib/research/providers/brave";
import { createTavilyProvider } from "@/lib/research/providers/tavily";
import type { ResearchProvider, ResearchSource } from "@/lib/research/types";
import type { AnswerProviderId, AnswerSourceDraft } from "../types";

export function answerSourceFromResearch(
  provider: AnswerProviderId,
  source: ResearchSource
): AnswerSourceDraft {
  return {
    provider,
    url: source.url,
    domain: source.domain,
    title: source.title,
    text: source.snippet.slice(0, 6000),
    attribution: null,
  };
}

function providerOrder(order?: readonly string[]): ("brave" | "tavily")[] {
  const envOrder = process.env.HELP_DESK_ANSWER_ENGINE_WEB_PROVIDERS?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const requested = order ?? envOrder;
  const fallback =
    getResearchConfig().provider === "brave"
      ? (["brave", "tavily"] as const)
      : (["tavily", "brave"] as const);
  const values = requested?.length ? requested : fallback;
  const filtered = values.filter(
    (value): value is "brave" | "tavily" =>
      value === "brave" || value === "tavily"
  );
  return filtered.length > 0 ? [...new Set(filtered)] : [...fallback];
}

export function createWebProviders(
  order?: readonly string[],
  options: { timeoutMs?: number } = {}
): ResearchProvider[] {
  const timeoutMs = options.timeoutMs ?? 8000;
  return providerOrder(order).map((provider) =>
    provider === "brave"
      ? createBraveProvider(undefined, { timeoutMs, maxAttempts: 1 })
      : createTavilyProvider(undefined, { timeoutMs, maxAttempts: 1 })
  );
}

export async function searchWithFailover(
  providers: readonly ResearchProvider[],
  query: string,
  signal: AbortSignal,
  beforeAttempt?: (provider: ResearchProvider) => Promise<boolean>
): Promise<{ provider: ResearchProvider; sources: ResearchSource[] } | null> {
  for (const provider of providers) {
    if (beforeAttempt && !(await beforeAttempt(provider))) return null;
    try {
      const result = await provider.search(query, signal);
      if (result.ok) return { provider, sources: result.value };
    } catch {
      continue;
    }
  }
  return null;
}
