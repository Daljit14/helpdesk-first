import { screenAnswerStep } from "./step-safety";
import type {
  AnswerEngineResult,
  PublicAnswerSource,
  SourceTier,
} from "./types";

export type AnswerCardStep = {
  kind: "official" | "community_tip";
  text: string;
  sourceIds: string[];
};

export type AnswerCardSource = {
  id: string;
  title: string;
  domain: string;
  url: string;
  label: "Official docs" | "Community post" | "Reference";
  attribution: string | null;
};

export type AnswerCard = {
  runId: string | null;
  outcome: "answer" | "needs_it" | "none";
  likelyCause: { text: string; sourceIds: string[] } | null;
  explanations: Array<{ text: string; sourceIds: string[] }>;
  steps: AnswerCardStep[];
  withheldForIt: number;
  sources: AnswerCardSource[];
};

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function sourceLabel(tier: SourceTier): AnswerCardSource["label"] {
  if (tier === "org_approved" || tier === "vendor") return "Official docs";
  if (tier === "reference") return "Reference";
  return "Community post";
}

function emptyCard(runId: string | null): AnswerCard {
  return {
    runId,
    outcome: "none",
    likelyCause: null,
    explanations: [],
    steps: [],
    withheldForIt: 0,
    sources: [],
  };
}

export function presentAnswer(
  result: AnswerEngineResult,
  ctx: {
    approvedSoftware: readonly string[];
    communityTipsEnabled: boolean;
  }
): AnswerCard {
  if (result.status !== "answered" || !result.answer)
    return emptyCard(result.runId);

  const sourceById = new Map<string, PublicAnswerSource>();
  for (const source of result.sources) {
    if (isHttps(source.url) && !sourceById.has(source.id))
      sourceById.set(source.id, source);
  }
  const sourceIdsFor = (sourceIds: string[]) =>
    [...new Set(sourceIds)].filter((id) => sourceById.has(id));
  const citedIds = new Set<string>();
  const rememberSources = (sourceIds: string[]) => {
    for (const id of sourceIds) citedIds.add(id);
  };

  let likelyCause: AnswerCard["likelyCause"] = null;
  if (
    result.answer.likelyCause &&
    screenAnswerStep(result.answer.likelyCause.text, ctx.approvedSoftware) ===
      null
  ) {
    const sourceIds = sourceIdsFor(result.answer.likelyCause.sourceIds);
    rememberSources(sourceIds);
    likelyCause = { text: result.answer.likelyCause.text, sourceIds };
  }

  const explanations = result.answer.explanations.flatMap((item) => {
    if (screenAnswerStep(item.text, ctx.approvedSoftware) !== null) return [];
    const sourceIds = sourceIdsFor(item.sourceIds);
    rememberSources(sourceIds);
    return [{ text: item.text, sourceIds }];
  });

  let withheldForIt = 0;
  const steps = result.answer.steps.flatMap((step) => {
    if (
      step.kind === "community" &&
      (!ctx.communityTipsEnabled || step.independentDomains < 2)
    )
      return [];
    if (screenAnswerStep(step.text, ctx.approvedSoftware) !== null) {
      withheldForIt += 1;
      return [];
    }
    const sourceIds = sourceIdsFor(step.sourceIds);
    rememberSources(sourceIds);
    return [
      {
        kind:
          step.kind === "community"
            ? ("community_tip" as const)
            : ("official" as const),
        text: step.text,
        sourceIds,
      },
    ];
  });

  const sources = [...citedIds].flatMap((id) => {
    const source = sourceById.get(id);
    if (!source) return [];
    return [
      {
        id: source.id,
        title: source.title,
        domain: source.domain,
        url: source.url,
        label: sourceLabel(source.tier),
        attribution: source.attribution,
      },
    ];
  });

  return {
    runId: result.runId,
    outcome:
      steps.length > 0 ? "answer" : withheldForIt > 0 ? "needs_it" : "none",
    likelyCause,
    explanations,
    steps,
    withheldForIt,
    sources,
  };
}
