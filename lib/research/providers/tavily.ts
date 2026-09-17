import { z } from "zod";
import { researchFetch } from "../http";
import type { ResearchProvider, ResearchSource } from "../types";

const responseSchema = z.object({
  results: z.array(
    z.object({ url: z.string().url(), title: z.string(), content: z.string() })
  ),
});

function clean(value: string, max: number): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function hash(value: string): string {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16);
}

export function createTavilyProvider(
  apiKey = process.env.TAVILY_API_KEY
): ResearchProvider {
  return {
    id: "tavily",
    async search(query, signal) {
      if (!apiKey)
        return {
          ok: false,
          error: {
            kind: "unauthorized",
            message: "Research provider key is not configured",
          },
        };
      return researchFetch(
        "https://api.tavily.com/search",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
        },
        (json) => {
          const parsed = responseSchema.parse(json);
          return parsed.results.slice(0, 5).map((result): ResearchSource => ({
            url: result.url,
            domain: new URL(result.url).hostname,
            title: clean(result.title, 300),
            snippet: clean(result.content, 1500),
            trust: "community",
            contentHash: hash(`${result.url}\n${result.content}`),
            fetchedAt: new Date().toISOString(),
          }));
        },
        signal
      );
    },
  };
}
