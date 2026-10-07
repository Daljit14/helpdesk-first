import { sanitizeAgentSearchQuery } from "@/lib/research/agent-search";
import {
  EMAIL,
  IP_ADDRESS,
  IPV6_CANDIDATE,
  IPV6_FULL,
} from "@/lib/agent/output-guard";

const ERROR_CODE_PATTERNS = [
  /\b0x[0-9a-f]{8}\b/gi,
  /\bAADSTS\d{5,6}\b/gi,
  /\b(?:error|code)\s*[:#]?\s*([A-Z]{0,4}-?\d{2,6})\b/gi,
];

const EMAIL_OR_IP_PATTERNS = [EMAIL, IP_ADDRESS, IPV6_CANDIDATE, IPV6_FULL];

function matchingCodes(problem: string): string[] {
  const codes = new Map<string, string>();
  for (const pattern of ERROR_CODE_PATTERNS) {
    for (const match of problem.matchAll(pattern)) {
      const code = match[1] ?? match[0];
      const start = (match.index ?? 0) + match[0].lastIndexOf(code);
      const end = start + code.length;
      const overlapsSensitiveValue = EMAIL_OR_IP_PATTERNS.some((sensitive) =>
        [...problem.matchAll(sensitive)].some((value) => {
          const valueStart = value.index ?? 0;
          const valueEnd = valueStart + value[0].length;
          return start < valueEnd && end > valueStart;
        })
      );
      if (overlapsSensitiveValue) continue;
      const key = code.toLowerCase();
      if (!codes.has(key)) codes.set(key, code);
      if (codes.size === 2) return [...codes.values()];
    }
  }
  return [...codes.values()];
}

function appendUnique(queries: string[], query: string | null): void {
  const value = query?.trim().slice(0, 120);
  if (value && !queries.includes(value)) queries.push(value);
}

export function planQueries(input: {
  problem: string;
  platform: string | null;
  product?: string | null;
  version?: string | null;
  denyTerms: readonly string[];
}): string[] {
  const plain = sanitizeAgentSearchQuery(input.problem, input.denyTerms);
  if (!plain) return [];

  const queries: string[] = [];
  appendUnique(queries, plain);

  const platform = input.platform
    ? sanitizeAgentSearchQuery(input.platform, input.denyTerms)
    : null;
  const plainWords = plain.split(/\s+/).filter(Boolean);
  const codes = matchingCodes(input.problem);
  if (codes.length > 0) {
    appendUnique(
      queries,
      [platform, ...codes, ...plainWords.slice(0, 4)].filter(Boolean).join(" ")
    );
  }

  if (input.product?.trim() || input.platform?.trim()) {
    const versionTokens = (input.version ?? "")
      .trim()
      .split(/\s+/)
      .filter((token) => token.length <= 12 && /^\d+(\.\d+){0,3}$/.test(token));
    const productQuery = sanitizeAgentSearchQuery(
      [input.platform ?? "", input.product ?? "", ...plainWords.slice(0, 5)]
        .filter(Boolean)
        .join(" "),
      input.denyTerms
    );
    const augmented = productQuery
      ? [...productQuery.split(/\s+/), ...versionTokens]
      : versionTokens;
    appendUnique(queries, augmented.join(" "));
  }

  if (queries.length < 2) appendUnique(queries, `${plain} fix`);
  return queries.slice(0, 4);
}
