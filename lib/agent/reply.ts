import { z } from "zod";
import type { OutputGuardContext } from "./output-guard";
import { toUserText } from "./output-guard";
import { trustLabel } from "@/lib/research/labels";
import type { TrustTier } from "@/lib/research/types";

export const finalReplySchema = z.object({
  summary: z.string().trim().min(1).max(400),
  checked: z.array(z.string().trim().min(1).max(160)).max(5).default([]),
  nextStep: z
    .object({
      action: z.string().trim().min(1).max(240),
      why: z.string().trim().max(200).optional(),
    })
    .nullable()
    .default(null),
  sourceIds: z.array(z.string().max(80)).max(5).default([]),
});

export type AgentReplyDraft = z.infer<typeof finalReplySchema>;

export const FINAL_REPLY_TOOL = {
  name: "final_reply" as const,
  description:
    "Finish your turn with a short, plain-language reply. Fill summary, what you checked, one next step with a short reason, and the ids of web sources you used. Code formats it for the user.",
  input_schema: z.toJSONSchema(finalReplySchema, { io: "input" }),
};

export type ReplySource = {
  label: "Official docs" | "Community post" | "Reference";
  title: string;
  domain: string;
  url: string;
};

export type RenderedReply = {
  summary: string;
  checked: string[];
  nextStep: { action: string; why: string | null } | null;
  sources: ReplySource[];
};

export function safeFinalText(value: string): {
  text: string;
  stripped: boolean;
} {
  const stripped = /\b(fixed|resolved|solved)\b/i.test(value);
  return {
    stripped,
    text: stripped
      ? value.replace(/\b(fixed|resolved|solved)\b/gi, "may have addressed")
      : value,
  };
}

export function renderAgentReply(
  draft: AgentReplyDraft,
  ctx: {
    webSources: ReadonlyMap<
      string,
      { title: string; domain: string; url: string; trust: TrustTier }
    >;
    outputGuard: OutputGuardContext;
  }
): { reply: RenderedReply; text: string; claimStripped: boolean } {
  let claimStripped = false;
  const clean = (value: string) => {
    const safe = safeFinalText(value);
    claimStripped ||= safe.stripped;
    return toUserText(safe.text, ctx.outputGuard).trim();
  };
  const reply: RenderedReply = {
    summary: clean(draft.summary),
    checked: draft.checked.map(clean).filter(Boolean),
    nextStep: null,
    sources: [],
  };
  if (draft.nextStep) {
    const action = clean(draft.nextStep.action);
    const why = draft.nextStep.why ? clean(draft.nextStep.why) : "";
    if (action) reply.nextStep = { action, why: why || null };
  }

  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  for (const sourceId of draft.sourceIds) {
    if (reply.sources.length >= 5 || seenIds.has(sourceId)) continue;
    seenIds.add(sourceId);
    const source = ctx.webSources.get(sourceId);
    if (!source) continue;
    let url: string;
    try {
      const parsed = new URL(source.url);
      if (parsed.protocol !== "https:") continue;
      url = parsed.href;
    } catch {
      continue;
    }
    if (seenUrls.has(url)) continue;
    const title = clean(source.title);
    const domain = clean(source.domain);
    if (!title || !domain) continue;
    seenUrls.add(url);
    reply.sources.push({
      label: trustLabel(source.trust),
      title,
      domain,
      url,
    });
  }

  const format = () => {
    const sections: string[] = [];
    if (reply.summary) sections.push(reply.summary);
    if (reply.checked.length > 0)
      sections.push(
        `What I checked:\n${reply.checked.map((item) => `- ${item}`).join("\n")}`
      );
    if (reply.nextStep) {
      sections.push(
        [
          `Next step: ${reply.nextStep.action}`,
          ...(reply.nextStep.why ? [`Why: ${reply.nextStep.why}`] : []),
        ].join("\n")
      );
    }
    if (reply.sources.length > 0)
      sections.push(
        `Sources:\n${reply.sources
          .map(
            (source) => `- ${source.label}: ${source.title} (${source.domain})`
          )
          .join("\n")}`
      );
    return sections.join("\n\n");
  };

  let text = format();
  while (text.length > 1200 && reply.checked.length > 0) {
    reply.checked.pop();
    text = format();
  }
  while (text.length > 1200 && reply.sources.length > 0) {
    reply.sources.pop();
    text = format();
  }
  return { reply, text: text.slice(0, 1200), claimStripped };
}
