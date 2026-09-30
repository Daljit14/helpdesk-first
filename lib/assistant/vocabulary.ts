import { CATEGORIES, ISSUES } from "@/lib/issues";
import {
  CANONICAL,
  COMMON_WORDS,
  IT_WORDS,
  NON_IT_WORDS,
  canonicalize,
  collapseRepeats,
  damerauLevenshtein,
  stem,
  tokenize,
  trigramSimilarity,
  typoBudget,
} from "./text";

/** Every surface word that appears in an approved guide's title/symptoms. */
export const GUIDE_WORDS: ReadonlySet<string> = new Set(
  ISSUES.flatMap((issue) => [
    ...tokenize(issue.title),
    ...tokenize(issue.id.replace(/-/g, " ")),
    ...issue.symptoms.flatMap(tokenize),
  ]).concat(CATEGORIES.flatMap((category) => tokenize(category.label)))
);

/**
 * Domain words: IT vocabulary plus guide words that are not everyday English.
 * A message containing one of these is (very likely) about an IT problem.
 */
export const DOMAIN_WORDS: ReadonlySet<string> = new Set([
  ...IT_WORDS,
  ...Object.keys(CANONICAL),
  ...[...GUIDE_WORDS].filter(
    (word) => word.length >= 3 && !COMMON_WORDS.has(word)
  ),
]);

/** Everything we consider a "real word". */
export const KNOWN_WORDS: ReadonlySet<string> = new Set([
  ...COMMON_WORDS,
  ...NON_IT_WORDS,
  ...DOMAIN_WORDS,
  ...GUIDE_WORDS,
]);

/** Candidates for typo correction, preferring domain words. */
const CORRECTION_CANDIDATES = [...DOMAIN_WORDS].filter(
  (word) => word.length >= 3 && /^[a-z]+$/.test(word)
);

function variants(token: string): string[] {
  return [
    ...new Set([
      token,
      collapseRepeats(token, 2),
      collapseRepeats(token, 1),
      stem(token),
      stem(collapseRepeats(token, 2)),
    ]),
  ];
}

/** Is this token (or its elongation-collapsed / stemmed form) a real word? */
export function knownForm(token: string): string | null {
  for (const form of variants(token)) {
    if (KNOWN_WORDS.has(form)) return form;
  }
  return null;
}

/** Is this token (or a variant) a domain/IT word? */
export function domainForm(token: string): string | null {
  for (const form of variants(token)) {
    if (DOMAIN_WORDS.has(form)) return form;
  }
  return null;
}

const correctionCache = new Map<string, string | null>();

/**
 * Best domain word for a probable typo ("prnter" → "printer",
 * "outlok" → "outlook", "wifii" → "wifi"), or null when nothing is close.
 */
export function correctTypo(token: string): string | null {
  if (correctionCache.has(token)) return correctionCache.get(token) ?? null;
  let result: string | null = null;
  const direct = domainForm(token);
  if (direct) {
    result = direct;
  } else if (/^[a-z]+$/.test(token) && token.length >= 4) {
    const base = collapseRepeats(token, 2);
    const budget = typoBudget(base.length);
    let bestDistance = Infinity;
    let bestSimilarity = 0;
    for (const candidate of CORRECTION_CANDIDATES) {
      if (Math.abs(candidate.length - base.length) > budget) continue;
      // Typos rarely change the first letter; this also avoids silly
      // corrections between unrelated short words.
      if (candidate[0] !== base[0]) continue;
      const distance = damerauLevenshtein(base, candidate, budget);
      if (distance > budget) continue;
      const similarity = trigramSimilarity(base, candidate);
      if (
        distance < bestDistance ||
        (distance === bestDistance && similarity > bestSimilarity)
      ) {
        bestDistance = distance;
        bestSimilarity = similarity;
        result = candidate;
      }
    }
    // A 2-edit correction must still look alike.
    if (result && bestDistance >= 2 && bestSimilarity < 0.2) result = null;
  }
  correctionCache.set(token, result);
  return result;
}

/** Canonical matching token for a query word, applying typo correction. */
export function resolveToken(token: string): {
  canonical: string;
  corrected?: string;
  known: boolean;
} {
  const known = knownForm(token);
  if (known) return { canonical: canonicalize(known), known: true };
  const corrected = correctTypo(token);
  if (corrected) {
    return { canonical: canonicalize(corrected), corrected, known: true };
  }
  return { canonical: canonicalize(token), known: false };
}

/** Character-bigram counts over all known words (with word boundaries). */
export const BIGRAMS: ReadonlyMap<string, number> = (() => {
  const counts = new Map<string, number>();
  for (const word of KNOWN_WORDS) {
    if (!/^[a-z]+$/.test(word)) continue;
    const padded = `^${word}$`;
    for (let index = 0; index < padded.length - 1; index += 1) {
      const gram = padded.slice(index, index + 2);
      counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
  }
  return counts;
})();
