import { z } from "zod";
import { researchFetch } from "@/lib/research/http";
import type { AnswerProvider, AnswerSourceDraft } from "../types";
import { htmlToText } from "../html";

const searchResponseSchema = z.object({
  items: z.array(
    z.object({
      question_id: z.number().int(),
      accepted_answer_id: z.number().int().optional(),
      title: z.string(),
      link: z.string().url(),
    })
  ),
  backoff: z.number().nonnegative().optional(),
});

const answersResponseSchema = z.object({
  items: z.array(
    z.object({
      answer_id: z.number().int(),
      question_id: z.number().int().optional(),
      body: z.string(),
      link: z.string().url().optional(),
      owner: z
        .object({ display_name: z.string().optional() })
        .optional()
        .nullable(),
    })
  ),
  backoff: z.number().nonnegative().optional(),
});

const DEFAULT_SITES = ["superuser", "serverfault", "askubuntu"];
const SITE_BACKOFF_UNTIL = new Map<string, number>();

function configuredSites(sites?: readonly string[]): string[] {
  const requested =
    sites ??
    process.env.HELP_DESK_STACKEXCHANGE_SITES?.split(",").map((site) =>
      site.trim().toLowerCase()
    ) ??
    DEFAULT_SITES;
  return [...new Set(requested)]
    .filter((site) => /^[a-z0-9-]{2,40}$/.test(site))
    .slice(0, 3);
}

function siteName(site: string): string {
  return (
    {
      superuser: "Super User",
      serverfault: "Server Fault",
      askubuntu: "Ask Ubuntu",
      stackoverflow: "Stack Overflow",
    }[site] ??
    site.replace(
      /(^|-)([a-z])/g,
      (_, separator: string, letter: string) =>
        `${separator ? " " : ""}${letter.toUpperCase()}`
    )
  );
}

function recordBackoff(site: string, seconds?: number, now = Date.now()): void {
  if (seconds && seconds > 0)
    SITE_BACKOFF_UNTIL.set(site, now + seconds * 1000);
}

export function clearStackExchangeBackoff(): void {
  SITE_BACKOFF_UNTIL.clear();
}

export function createStackExchangeProvider(
  options: {
    apiKey?: string | null;
    sites?: readonly string[];
    timeoutMs?: number;
    now?: () => number;
  } = {}
): AnswerProvider {
  const apiKey = options.apiKey ?? process.env.STACKEXCHANGE_KEY?.trim() ?? "";
  const sites = configuredSites(options.sites);
  const timeoutMs = options.timeoutMs ?? 4000;
  const now = options.now ?? Date.now;

  return {
    id: "stackexchange",
    async search(query, signal): Promise<AnswerSourceDraft[]> {
      if (!apiKey) return [];
      const sources: AnswerSourceDraft[] = [];
      for (const site of sites) {
        if ((SITE_BACKOFF_UNTIL.get(site) ?? 0) > now()) continue;
        const searchUrl = new URL(
          "https://api.stackexchange.com/2.3/search/advanced"
        );
        for (const [key, value] of Object.entries({
          order: "desc",
          sort: "relevance",
          accepted: "true",
          pagesize: "3",
          q: query,
          site,
          key: apiKey,
        }))
          searchUrl.searchParams.set(key, value);

        const search = await researchFetch(
          searchUrl.toString(),
          { headers: { accept: "application/json" } },
          (json) => searchResponseSchema.parse(json),
          signal,
          timeoutMs,
          1
        );
        if (!search.ok) continue;
        recordBackoff(site, search.value.backoff, now());
        const accepted = search.value.items.filter(
          (item) => item.accepted_answer_id !== undefined
        );
        if (accepted.length === 0 || search.value.backoff) continue;

        const answerIds = accepted.map(
          (item) => item.accepted_answer_id as number
        );
        const answersUrl = new URL(
          `https://api.stackexchange.com/2.3/answers/${answerIds.join(";")}`
        );
        answersUrl.searchParams.set("site", site);
        answersUrl.searchParams.set("filter", "withbody");
        answersUrl.searchParams.set("key", apiKey);
        const answers = await researchFetch(
          answersUrl.toString(),
          { headers: { accept: "application/json" } },
          (json) => answersResponseSchema.parse(json),
          signal,
          timeoutMs,
          1
        );
        if (!answers.ok) continue;
        recordBackoff(site, answers.value.backoff, now());
        const questionsById = new Map(
          accepted.map((question) => [question.question_id, question])
        );
        for (const answer of answers.value.items) {
          const question = answer.question_id
            ? questionsById.get(answer.question_id)
            : accepted.find(
                (item) => item.accepted_answer_id === answer.answer_id
              );
          if (!question) continue;
          sources.push({
            provider: "stackexchange",
            url: answer.link ?? question.link,
            domain: new URL(answer.link ?? question.link).hostname,
            title: question.title.slice(0, 300),
            text: htmlToText(answer.body).slice(0, 2000),
            attribution: `${answer.owner?.display_name ?? "Stack Exchange contributor"} on ${siteName(site)}, CC BY-SA 4.0`,
          });
        }
      }
      return sources;
    },
  };
}
