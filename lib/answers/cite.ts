import { NO_REQUESTER, toUserText } from "@/lib/agent/output-guard";
import { registrableDomain } from "./tiers";
import type {
  Answer,
  AnswerItem,
  AnswerSource,
  AnswerStep,
  SourceTier,
} from "./types";
import type { AnswerDraft } from "./synthesize";
import { TIER_RANK } from "./types";

const STEP_CONFIDENCE: Record<Exclude<SourceTier, "reference">, number> = {
  org_approved: 0.9,
  vendor: 0.8,
  qa_community: 0.55,
  community: 0.35,
};

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function bestTier(tiers: SourceTier[]): SourceTier | null {
  return (
    [...tiers].sort((left, right) => TIER_RANK[left] - TIER_RANK[right])[0] ??
    null
  );
}

export function enforceCitations(
  draft: AnswerDraft,
  sources: AnswerSource[]
): { answer: Answer; droppedClaims: number } {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  let droppedClaims = 0;

  const cleanItem = (
    item: AnswerItem,
    referenceOnlyFix = false
  ): AnswerItem | null => {
    const sourceIds = distinct(
      item.sourceIds.filter((id) => sourceById.has(id))
    );
    if (sourceIds.length === 0) {
      droppedClaims += 1;
      return null;
    }
    const cited = sourceIds.map((id) => sourceById.get(id) as AnswerSource);
    if (
      referenceOnlyFix &&
      cited.every((source) => source.tier === "reference")
    ) {
      droppedClaims += 1;
      return null;
    }
    const text = toUserText(item.text, NO_REQUESTER).trim();
    if (!text) {
      droppedClaims += 1;
      return null;
    }
    return { text, sourceIds };
  };

  const likelyCause = draft.likelyCause
    ? cleanItem(draft.likelyCause, true)
    : null;
  const explanations = draft.explanations.flatMap((item) => {
    const cleaned = cleanItem(item);
    return cleaned ? [cleaned] : [];
  });
  const steps: AnswerStep[] = draft.steps.flatMap((item) => {
    const cleaned = cleanItem(item, true);
    if (!cleaned) return [];
    const cited = cleaned.sourceIds.map(
      (id) => sourceById.get(id) as AnswerSource
    );
    const tiers = distinct(cited.map((source) => source.tier));
    const best = bestTier(tiers);
    if (!best || best === "reference") {
      droppedClaims += 1;
      return [];
    }
    const independentDomains = distinct(
      cited
        .filter((source) => source.tier !== "reference")
        .map((source) => registrableDomain(source.domain))
    ).length;
    const confidence =
      Math.round(
        Math.min(1, STEP_CONFIDENCE[best] + 0.1 * (independentDomains - 1)) *
          100
      ) / 100;
    return [
      {
        ...cleaned,
        kind: cited.some(
          (source) => source.tier === "org_approved" || source.tier === "vendor"
        )
          ? "official"
          : "community",
        tiers,
        independentDomains,
        confidence,
      },
    ];
  });
  const stepTiers = steps.flatMap((step) => step.tiers);
  return {
    answer: {
      likelyCause,
      explanations,
      steps,
      confidence: Math.max(0, ...steps.map((step) => step.confidence)),
      topTier: bestTier(stepTiers),
    },
    droppedClaims,
  };
}
