import type { EvidenceHypothesis } from "@/lib/evidence/types";

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 8);
}

export function buildResearchQueries(input: {
  category: string | null;
  platform: string | null;
  hypotheses: EvidenceHypothesis[];
  guideTitles: string[];
}): string[] {
  const category = words(input.category ?? "").join(" ");
  const platform = words(input.platform ?? "").join(" ");
  const candidates = [
    ...input.hypotheses.slice(0, 3).map((hypothesis) => {
      const title = input.guideTitles.find(
        (candidate) => candidate === hypothesis.guideSlug
      );
      return [
        platform,
        category,
        ...words(hypothesis.cause),
        ...words(title ?? ""),
      ]
        .filter(Boolean)
        .join(" ");
    }),
    ...input.guideTitles
      .slice(0, 2)
      .map((title) =>
        [platform, category, ...words(title)].filter(Boolean).join(" ")
      ),
  ];
  return [...new Set(candidates)]
    .map((query) => query.trim().slice(0, 120))
    .filter((query) => query.length > 0)
    .slice(0, 3);
}
