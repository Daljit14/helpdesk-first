import { z } from "zod";
import { researchFetch } from "../http";
import type { ResearchProvider, ResearchSource } from "../types";

const responseSchema = z.object({
  web: z.object({
    results: z.array(
      z.object({
        url: z.string().url(),
        title: z.string(),
        description: z.string(),
      })
    ),
  }),
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

export function createBraveProvider(
  apiKey = process.env.BRAVE_SEARCH_API_KEY
): ResearchProvider {
  return {
    id: "brave",
    async search(query, signal) {
      if (!apiKey)
        return {
          ok: false,
          error: {
            kind: "unauthorized",
            message: "Research provider key is not configured",
          },
        };
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", "5");
      return researchFetch(
        url.toString(),
        {
          headers: {
            "x-subscription-token": apiKey,
            accept: "application/json",
          },
        },
        (json) => {
          const parsed = responseSchema.parse(json);
          return parsed.web.results
            .slice(0, 5)
            .map((result): ResearchSource => ({
              url: result.url,
              domain: new URL(result.url).hostname,
              title: clean(result.title, 300),
              snippet: clean(result.description, 1500),
              trust: "community",
              contentHash: hash(`${result.url}\n${result.description}`),
              fetchedAt: new Date().toISOString(),
            }));
        },
        signal
      );
    },
  };
}
