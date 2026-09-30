/**
 * Confidence-scored matching of a free-text problem to the approved guides.
 *
 * Unlike `filterIssues` (a browse/search filter), this answers "is there a
 * guide we can *confidently* recommend?". It tolerates typos ("prnter",
 * "outlok", "wifii keeps droping") through elongation collapsing, canonical
 * IT synonyms and Damerau-Levenshtein correction, and it refuses to pretend:
 * below the confidence floor it returns the closest guides as suggestions.
 */
import { CATEGORIES, ISSUES, type Device, type Issue } from "@/lib/issues";
import {
  GENERIC_WORDS,
  canonicalize,
  normalizePhrases,
  tokenize,
} from "./text";
import { resolveToken } from "./vocabulary";

export type GuideMatchStatus = "confident" | "weak" | "none";

export type GuideCandidate = {
  issue: Issue;
  /** Raw weighted score. */
  score: number;
  /** 0–1 confidence that this guide fits the description. */
  confidence: number;
  /** Canonical query terms that matched this guide. */
  matchedTerms: string[];
};

export type GuideMatchResult = {
  status: GuideMatchStatus;
  /** Confidence of the best candidate (0 when nothing matched). */
  confidence: number;
  /** The recommended guide — only set when status is "confident". */
  best: GuideCandidate | null;
  /** Ranked candidates (up to `limit`). */
  candidates: GuideCandidate[];
  /** Closest guides to offer when there is no confident match. */
  suggestions: Issue[];
  /** Typos that were corrected, e.g. { prnter: "printer" }. */
  corrections: Record<string, string>;
  /** Canonical content terms extracted from the query. */
  terms: string[];
};

export type GuideMatchOptions = {
  platform?: Device | null;
  /** Number of candidates / suggestions to return (default 3). */
  limit?: number;
  /** Minimum confidence for a "confident" match (default 0.6). */
  minConfidence?: number;
  /** Minimum confidence for "weak" suggestions (default 0.25). */
  minSuggestionConfidence?: number;
};

export const DEFAULT_MIN_CONFIDENCE = 0.6;

const PLATFORM_WORDS = new Set([
  "windows",
  "window",
  "win10",
  "win11",
  "mac",
  "macos",
  "os",
  "apple",
  "ios",
  "linux",
  "other",
]);

/**
 * Short phrases whose meaning is not carried by single keywords
 * (e.g. "won't open" is about launching an app, whatever the app is).
 * Tested against the phrase-normalised text ("won't" → "wont").
 */
const PHRASE_BOOSTS: Partial<Record<string, RegExp[]>> = {
  "app-wont-open": [
    /\b(?:wont|doesnt|cant|isnt|not|never|fails? to|unable to)\s+(?:open|launch|load up)\b/,
  ],
  "computer-wont-start": [
    /\b(?:computer|pc|laptop|desktop|mac)\b.*\b(?:wont|doesnt|cant|not)\s+(?:turn on|start|boot|power on)\b/,
  ],
  "no-internet": [/\bno (?:internet|connection|network)\b/],
};

type GuideDocument = {
  issue: Issue;
  weights: Map<string, number>;
  titleTerms: Set<string>;
};

function contentTerms(value: string): string[] {
  return tokenize(value)
    .filter((token) => !GENERIC_WORDS.has(token))
    .map(canonicalize)
    .filter((token) => !GENERIC_WORDS.has(token));
}

const DOCUMENTS: GuideDocument[] = ISSUES.map((issue) => {
  const weights = new Map<string, number>();
  const add = (value: string, weight: number) => {
    for (const term of contentTerms(value)) {
      weights.set(term, Math.max(weights.get(term) ?? 0, weight));
    }
  };
  add(issue.title, 3);
  add(issue.id.replace(/-/g, " "), 2.5);
  for (const symptom of issue.symptoms) add(symptom, 1.5);
  add(
    CATEGORIES.find((category) => category.id === issue.category)?.label ??
      issue.category,
    1
  );
  return {
    issue,
    weights,
    titleTerms: new Set(contentTerms(issue.title)),
  };
});

const IDF = (() => {
  const frequency = new Map<string, number>();
  for (const document of DOCUMENTS) {
    for (const term of document.weights.keys()) {
      frequency.set(term, (frequency.get(term) ?? 0) + 1);
    }
  }
  return new Map(
    [...frequency].map(([term, count]) => [term, 1 / (1 + Math.log(count))])
  );
})();

/** Extract canonical, typo-corrected content terms from a problem text. */
export function extractTerms(text: string): {
  terms: string[];
  corrections: Record<string, string>;
} {
  const corrections: Record<string, string> = {};
  const terms: string[] = [];
  for (const token of tokenize(text)) {
    if (GENERIC_WORDS.has(token) || PLATFORM_WORDS.has(token)) continue;
    const resolved = resolveToken(token);
    if (resolved.corrected && resolved.corrected !== token) {
      corrections[token] = resolved.corrected;
    }
    if (GENERIC_WORDS.has(resolved.canonical)) continue;
    if (!terms.includes(resolved.canonical)) terms.push(resolved.canonical);
  }
  return { terms, corrections };
}

/**
 * Match a problem description to the approved guides with a confidence
 * score. Never throws; empty/unmatched input yields status "none".
 */
export function matchGuides(
  text: string,
  options: GuideMatchOptions = {}
): GuideMatchResult {
  const limit = Math.max(1, options.limit ?? 3);
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const minSuggestion = options.minSuggestionConfidence ?? 0.25;
  const { terms, corrections } = extractTerms(text);
  const empty: GuideMatchResult = {
    status: "none",
    confidence: 0,
    best: null,
    candidates: [],
    suggestions: [],
    corrections,
    terms,
  };
  if (terms.length === 0) return empty;
  const phrased = normalizePhrases(text);

  const scored = DOCUMENTS.filter(
    (document) =>
      !options.platform || document.issue.devices.includes(options.platform)
  )
    .map((document) => {
      let score = 0;
      const matchedTerms: string[] = [];
      for (const term of terms) {
        const weight = document.weights.get(term);
        if (weight === undefined) continue;
        score += weight * (IDF.get(term) ?? 1);
        matchedTerms.push(term);
      }
      // Reward descriptions that cover most of the guide's title.
      const titleHits = [...document.titleTerms].filter((term) =>
        matchedTerms.includes(term)
      ).length;
      const titleCoverage = document.titleTerms.size
        ? titleHits / document.titleTerms.size
        : 0;
      if (titleHits >= 2) score += titleCoverage;
      for (const boost of PHRASE_BOOSTS[document.issue.id] ?? []) {
        if (boost.test(phrased)) score += 1.5;
      }
      return { document, score, matchedTerms, titleCoverage };
    })
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.titleCoverage - left.titleCoverage ||
        left.document.issue.title.localeCompare(right.document.issue.title)
    );

  if (scored.length === 0) return empty;

  const topScore = scored[0].score;
  const runnerUp = scored[1]?.score ?? 0;
  const candidates: GuideCandidate[] = scored
    .slice(0, limit)
    .map((item, index) => {
      const strength = Math.min(1, item.score / 3);
      const coverage = Math.min(1, item.matchedTerms.length / terms.length);
      const base = 0.45 * strength + 0.3 * coverage + 0.1 * item.titleCoverage;
      // Only the leader earns the "clear winner" bonus; a tie means the
      // description fits several guides equally, so we should not pretend.
      const margin = index === 0 ? (topScore - runnerUp) / topScore : 0;
      const confidence =
        (base + 0.15 * Math.min(1, margin * 2)) * (item.score / topScore);
      return {
        issue: item.document.issue,
        score: Number(item.score.toFixed(3)),
        confidence: Number(Math.min(1, confidence).toFixed(3)),
        matchedTerms: item.matchedTerms,
      };
    });

  const top = candidates[0];
  const status: GuideMatchStatus =
    top.confidence >= minConfidence
      ? "confident"
      : top.confidence >= minSuggestion
        ? "weak"
        : "none";
  return {
    status,
    confidence: top.confidence,
    best: status === "confident" ? top : null,
    candidates,
    suggestions:
      status === "confident" ? [] : candidates.map((item) => item.issue),
    corrections,
    terms,
  };
}
