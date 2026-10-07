import { BANNED_REPLY_WORDS } from "./style";

export type ReplyQualityChecks = {
  gradeOk: boolean;
  sentenceLengthOk: boolean;
  questionsOk: boolean;
  noBannedWords: boolean;
  checkedOk: boolean;
  sourcesOk: boolean;
  labelsOk: boolean;
};

export type ReplyQualityScore = {
  grade: number;
  checks: ReplyQualityChecks;
  checksPassed: number;
  passed: boolean;
};

const WORD_PATTERN = /[A-Za-z0-9'’-]+/g;
const BANNED_WORD_PATTERN = new RegExp(
  `\\b(?:${BANNED_REPLY_WORDS.join("|")})\\b`,
  "i"
);

function syllables(word: string): number {
  if (/^[A-Z]{2,5}$/.test(word)) return word.length;
  if (/^\d+$/.test(word)) return 1;

  const letters = word.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length <= 3) return 1;
  const normalized = letters
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  return Math.max(1, normalized.match(/[aeiouy]{1,2}/g)?.length ?? 0);
}

function sentences(text: string): string[] {
  return text
    .split(/[.!?]+(?=\s|$)/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function words(text: string): string[] {
  return text.match(WORD_PATTERN) ?? [];
}

export function fleschKincaidGrade(text: string): number {
  const sentenceWords = sentences(text).map(words);
  const wordCount = sentenceWords.reduce(
    (total, sentence) => total + sentence.length,
    0
  );
  const sentenceCount = sentenceWords.length;
  if (wordCount === 0 || sentenceCount === 0) return 0;
  const syllableCount = sentenceWords
    .flat()
    .reduce((total, word) => total + syllables(word), 0);
  const grade =
    0.39 * (wordCount / sentenceCount) +
    11.8 * (syllableCount / wordCount) -
    15.59;
  return Math.round(grade * 100) / 100;
}

export function scoreReply(input: {
  text: string;
  toolsRan: boolean;
  webUsed: boolean;
  communitySourcesLabelled: boolean;
  hasChecked: boolean;
  sourcesShown: boolean;
}): ReplyQualityScore {
  const sentenceWords = sentences(input.text).map(words);
  const wordCount = sentenceWords.reduce(
    (total, sentence) => total + sentence.length,
    0
  );
  const averageSentenceLength =
    sentenceWords.length > 0 ? wordCount / sentenceWords.length : 0;
  const checks: ReplyQualityChecks = {
    gradeOk: fleschKincaidGrade(input.text) <= 8,
    sentenceLengthOk:
      averageSentenceLength <= 15 &&
      sentenceWords.every((sentence) => sentence.length <= 25),
    questionsOk: (input.text.match(/\?/g) ?? []).length <= 2,
    noBannedWords:
      !BANNED_WORD_PATTERN.test(input.text) && !input.text.includes("!"),
    checkedOk: !input.toolsRan || input.hasChecked,
    sourcesOk: !input.webUsed || input.sourcesShown,
    labelsOk: input.communitySourcesLabelled,
  };
  const checksPassed = Object.values(checks).filter(Boolean).length;
  return {
    grade: fleschKincaidGrade(input.text),
    checks,
    checksPassed,
    passed: checksPassed === 7,
  };
}
