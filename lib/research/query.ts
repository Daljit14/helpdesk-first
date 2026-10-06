import type { EvidenceHypothesis } from "@/lib/evidence/types";

export function queryWords(value: string, maxWords = 8): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, maxWords);
}

export function buildResearchQueries(input: {
  category: string | null;
  platform: string | null;
  hypotheses: EvidenceHypothesis[];
  guideTitles: string[];
}): string[] {
  const category = queryWords(input.category ?? "").join(" ");
  const platform = queryWords(input.platform ?? "").join(" ");
  const candidates = [
    ...input.hypotheses.slice(0, 3).map((hypothesis) => {
      const title = input.guideTitles.find(
        (candidate) => candidate === hypothesis.guideSlug
      );
      return [
        platform,
        category,
        ...queryWords(hypothesis.cause),
        ...queryWords(title ?? ""),
      ]
        .filter(Boolean)
        .join(" ");
    }),
    ...input.guideTitles
      .slice(0, 2)
      .map((title) =>
        [platform, category, ...queryWords(title)].filter(Boolean).join(" ")
      ),
  ];
  return [...new Set(candidates)]
    .map((query) => query.trim().slice(0, 120))
    .filter((query) => query.length > 0)
    .slice(0, 3);
}
