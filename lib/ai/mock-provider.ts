import { issues } from "@/lib/knowledge-base";
import type { Platform } from "@/lib/helpdesk-data";
import { getIssueBySlug } from "@/lib/search";
import type { AiIntakeInput, AiIntakeOutput, AiProvider } from "./types";
import { diagnosticQuestions } from "./types";
import { getSafeResponseLimit } from "./safety-policy";

// Thresholds tuned for deterministic matching against the approved knowledge base.
// A title-phrase match alone is usually enough to clear the threshold,
// while a small gap requirement reduces false matches when two issues are similar.
const MATCH_SCORE_THRESHOLD = 5;
const MATCH_GAP_THRESHOLD = 1;
const MIN_SCORE_FOR_CLARIFY = 2;
const MAX_QUESTIONS = 3;

// Stop words are ignored when scoring token overlap so generic words cannot
// produce an accidental IT issue match.
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  "shall",
  "of",
  "for",
  "in",
  "on",
  "at",
  "to",
  "from",
  "by",
  "with",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "under",
  "and",
  "or",
  "but",
  "so",
  "if",
  "then",
  "than",
  "when",
  "where",
  "why",
  "how",
  "what",
  "who",
  "which",
  "this",
  "that",
  "these",
  "those",
  "i",
  "me",
  "my",
  "mine",
  "you",
  "your",
  "he",
  "she",
  "it",
  "we",
  "us",
  "our",
  "they",
  "them",
  "their",
]);

export class MockAiProvider implements AiProvider {
  async classify(input: AiIntakeInput): Promise<AiIntakeOutput> {
    const combined = buildCombinedText(input);
    const detectedPlatform = input.platform ?? detectPlatform(combined);
    const scored = scoreIssues(combined, detectedPlatform);
    const sorted = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (sorted.length === 0) {
      return {
        decision: "escalate",
        detectedPlatform,
        escalationReason:
          "Your description does not match an issue that HelpDesk First can guide you through. Please contact your IT team or use the search page.",
      };
    }

    const top = sorted[0];
    const second = sorted[1];
    const confidence = top.score;
    const gap = second ? confidence - second.score : Infinity;

    if (
      detectedPlatform === null &&
      (input.platform === null || input.platform === undefined)
    ) {
      return {
        decision: "clarify",
        detectedPlatform,
        diagnosticQuestionIds: ["which-platform"],
        explanation:
          "I need to know which device or operating system you are using before matching you to a guide.",
      };
    }

    if (detectedPlatform !== null && confidence < MIN_SCORE_FOR_CLARIFY) {
      return {
        decision: "escalate",
        detectedPlatform,
        escalationReason:
          "Your description does not clearly match an issue that HelpDesk First can guide you through. Please contact your IT team or use the search page.",
      };
    }

    const previousIds = new Set(
      (input.previousAnswers ?? []).map((a) => a.questionId)
    );
    const questionCount = input.previousAnswers?.length ?? 0;

    if (
      confidence >= MATCH_SCORE_THRESHOLD &&
      (gap >= MATCH_GAP_THRESHOLD || confidence >= MATCH_SCORE_THRESHOLD + 4)
    ) {
      const issue = getIssueBySlug(top.issue.slug);
      if (!issue) {
        return {
          decision: "escalate",
          detectedPlatform,
          escalationReason:
            "The matched issue could not be loaded from the approved knowledge base.",
        };
      }
      return {
        decision: "match",
        matchedIssueSlug: issue.slug,
        detectedPlatform,
        explanation: `Based on your description, this looks like "${issue.title}" for ${detectedPlatform ?? "your device"}. I can start the approved troubleshooting guide for that issue.`,
      };
    }

    if (questionCount >= MAX_QUESTIONS) {
      return {
        decision: "escalate",
        detectedPlatform,
        escalationReason:
          "I could not confidently match your description to an approved guide after a few questions. Please contact your IT team or use the search page.",
      };
    }

    const nextQuestions = selectDiagnosticQuestions(
      sorted.slice(0, 3).map((s) => s.issue.categoryId),
      detectedPlatform,
      previousIds
    );

    return {
      decision: "clarify",
      detectedPlatform,
      diagnosticQuestionIds: nextQuestions.slice(
        0,
        getSafeResponseLimit() - questionCount
      ),
      explanation:
        "I need a little more information to match you to the right approved guide.",
    };
  }
}

function buildCombinedText(input: AiIntakeInput): string {
  const parts = [input.message];
  for (const answer of input.previousAnswers ?? []) {
    parts.push(answer.answer);
  }
  return parts.join(" ").toLowerCase();
}

function detectPlatform(text: string): Platform | null {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");

  if (/\bwindows\b|\bwin10\b|\bwin11\b|\bpc\b(?!\s*phone)/i.test(normalized)) {
    return "Windows";
  }
  if (/\bmac\b|\bmacbook\b|\bmacos\b|\bos\s?x\b|\bapple\b/i.test(normalized)) {
    return "Mac";
  }
  if (
    /\bmobile\b|\bphone\b|\biphone\b|\bandroid\b|\bios\b|\bipad\b/i.test(
      normalized
    )
  ) {
    return "Mobile";
  }
  if (/\bother\b|\blinux\b|\bchromebook\b/i.test(normalized)) {
    return "Other";
  }
  return null;
}

type ScoredIssue = {
  issue: (typeof issues)[number];
  score: number;
};

function scoreIssues(text: string, platform: Platform | null): ScoredIssue[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
  const allTokens = normalized.split(" ").filter((t) => t.length > 0);
  const messageTokens = allTokens.filter((t) => !STOP_WORDS.has(t));
  const hasMeaningfulTokens = messageTokens.length > 0;

  return issues.map((issue) => {
    let score = 0;

    const normalizedTitle = issue.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (normalized.includes(normalizedTitle)) {
      // Exact title-phrase matches are strong, intentional matches.
      score += 20;
    } else {
      const titleTokens = new Set(
        normalizedTitle
          .split(" ")
          .filter((t) => t.length > 0 && !STOP_WORDS.has(t))
      );
      // Title tokens are high-signal, so one-character typos still count fully.
      score += scoreTokenOverlap(messageTokens, titleTokens, 2, 1);
    }

    for (const keyword of issue.keywords) {
      const normalizedKeyword = keyword
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .trim();
      if (normalized.includes(normalizedKeyword)) {
        score += 3;
      } else {
        const keywordTokens = new Set(
          normalizedKeyword
            .split(" ")
            .filter((t) => t.length > 0 && !STOP_WORDS.has(t))
        );
        score += scoreTokenOverlap(messageTokens, keywordTokens, 1);
      }
    }

    for (const symptom of issue.symptoms) {
      const normalizedSymptom = symptom
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .trim();
      if (normalized.includes(normalizedSymptom)) {
        score += 2;
      } else {
        const symptomTokens = new Set(
          normalizedSymptom.split(" ").filter((t) => t.length > 0)
        );
        score += scoreTokenOverlap(messageTokens, symptomTokens, 0.5);
      }
    }

    if (hasMeaningfulTokens && platform && issue.platforms.includes(platform)) {
      score += 1;
    }

    return { issue, score };
  });
}

function scoreTokenOverlap(
  messageTokens: string[],
  issueTokens: Iterable<string>,
  fullPoints: number,
  fuzzyRatio = 0.5
): number {
  let score = 0;
  for (const messageToken of messageTokens) {
    for (const issueToken of issueTokens) {
      if (messageToken === issueToken) {
        score += fullPoints;
      } else if (isSimilarToken(messageToken, issueToken)) {
        score += fullPoints * fuzzyRatio;
      }
    }
  }
  return score;
}

// Allows one-character typos for longer tokens so that misspelled problem
// descriptions still match approved knowledge-base terms.
function isSimilarToken(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  return levenshteinDistance(a, b) <= 1;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const previous: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let current = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const insertion = previous[j] + 1;
      const deletion = current + 1;
      const substitution = previous[j - 1] + cost;
      const next = Math.min(insertion, deletion, substitution);
      previous[j - 1] = current;
      current = next;
    }
    previous[n] = current;
  }
  return previous[n];
}

function selectDiagnosticQuestions(
  topCategoryIds: string[],
  platform: Platform | null,
  asked: Set<string>
): string[] {
  const selected: string[] = [];
  const used = new Set(asked);

  for (const categoryId of topCategoryIds) {
    for (const question of diagnosticQuestions) {
      if (selected.length >= getSafeResponseLimit()) break;
      if (used.has(question.id)) continue;
      if (question.id === "which-platform" && platform !== null) continue;
      if (question.categoryIds && !question.categoryIds.includes(categoryId))
        continue;
      selected.push(question.id);
      used.add(question.id);
    }
  }

  if (selected.length === 0) {
    for (const question of diagnosticQuestions) {
      if (selected.length >= getSafeResponseLimit()) break;
      if (used.has(question.id)) continue;
      if (question.id === "which-platform" && platform !== null) continue;
      selected.push(question.id);
      used.add(question.id);
    }
  }

  return selected;
}

export function createAiProvider(): AiProvider {
  return new MockAiProvider();
}
