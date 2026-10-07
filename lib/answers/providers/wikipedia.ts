import { z } from "zod";
import { researchFetch } from "@/lib/research/http";
import type { AnswerProvider } from "../types";

const responseSchema = z.object({
  query: z.object({
    pages: z.array(
      z.object({
        title: z.string(),
        extract: z.string().optional(),
        fullurl: z.string().url().optional(),
      })
    ),
  }),
});

export function createWikipediaProvider(
  options: {
    contact?: string;
    timeoutMs?: number;
  } = {}
): AnswerProvider {
  const contact =
    options.contact?.trim() ||
    process.env.HELP_DESK_ANSWER_ENGINE_CONTACT?.trim() ||
    "https://github.com/Daljit14/helpdesk-first";
  return {
    id: "wikipedia",
    async search(query, signal) {
      const url = new URL("https://en.wikipedia.org/w/api.php");
      for (const [key, value] of Object.entries({
        action: "query",
        format: "json",
        formatversion: "2",
        generator: "search",
        gsrsearch: query,
        gsrlimit: "2",
        prop: "extracts|info",
        exintro: "1",
        explaintext: "1",
        exchars: "1200",
        inprop: "url",
      }))
        url.searchParams.set(key, value);

      const result = await researchFetch(
        url.toString(),
        {
          headers: {
            accept: "application/json",
            "user-agent": `HelpDeskFirstAnswerEngine/1.0 (${contact})`,
          },
        },
        (json) => responseSchema.parse(json),
        signal,
        options.timeoutMs ?? 4000,
        1
      );
      if (!result.ok) return [];
      return result.value.query.pages
        .filter((page) => page.fullurl && page.extract?.trim())
        .map((page) => ({
          provider: "wikipedia" as const,
          url: page.fullurl as string,
          domain: new URL(page.fullurl as string).hostname,
          title: page.title.slice(0, 300),
          text: page.extract!.replace(/\s+/g, " ").trim().slice(0, 1200),
          attribution: "Wikipedia contributors, CC BY-SA 4.0",
        }));
    },
  };
}
