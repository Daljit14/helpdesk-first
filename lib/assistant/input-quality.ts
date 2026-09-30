/**
 * Classifies what a requester typed into the Support Assistant *before* it is
 * matched to a guide, so greetings, small talk, keyboard mashing, secrets and
 * off-topic questions get a friendly, honest reply instead of a fake match.
 *
 * Pure and deterministic — safe to call on every keystroke.
 */
import { redactForLearning } from "@/lib/knowledge/learning-redaction";
import {
  COMMON_WORDS,
  GENERIC_WORDS,
  NON_IT_WORDS as OFF_TOPIC,
  collapseRepeats,
  tokenize,
} from "./text";
import { BIGRAMS, correctTypo, domainForm, knownForm } from "./vocabulary";

export type InputKind =
  | "empty"
  | "too_short"
  | "greeting"
  | "small_talk"
  | "gibberish"
  | "off_topic"
  | "sensitive"
  | "ok";

export type SensitiveType =
  "password" | "card" | "ssn" | "api_key" | "private_key";

export type InputAssessment = {
  kind: InputKind;
  /** Short developer-facing reason (not shown to users). */
  reason: string;
  sensitiveType?: SensitiveType;
  /** IT / guide words recognised in the text (after typo correction). */
  itTerms: string[];
  /** Tokens that look like keyboard mashing. */
  gibberishTokens: string[];
};

export type ClassifyOptions = {
  /**
   * "problem" (default) runs every check. "answer" is for replies to a
   * clarifying question, where "yes", "no" or "Mac" are perfectly valid, so
   * only empty, secret and gibberish input is flagged.
   */
  mode?: "problem" | "answer";
};

const GREETING_CORE = new Set(
  `hi hii hy hya hey heya hiya hai hello helo hallo hullo hola yo sup wassup wasup whatsup watsup howdy greetings morning afternoon evening gm gday namaste bonjour salut ciao aloha`.split(
    " "
  )
);
const GREETING_FILLER = new Set(
  `good there all everyone everybody guys folks team bot assistant helper support friend buddy mate sir maam madam again the`.split(
    " "
  )
);
const SMALL_TALK = new Set(
  `thanks thank thx ty tysm tnx you u ok okay k kk okey cool nice great awesome perfect good fine alright lol lmao rofl haha hehe hmm hm mhm yes yeah yep yup no nope nah bye goodbye cya later test testing sure wow np welcome please pls plz who what whats how are r doing up your name can do is this a an bot human real person ai robot there it be what's again much so very`.split(
    " "
  )
);
const SMALL_TALK_CORE = new Set(
  `thanks thank thx ty tysm tnx ok okay k kk okey cool nice great awesome perfect lol lmao rofl haha hehe hmm hm mhm yes yeah yep yup no nope nah bye goodbye cya test testing sure wow np who what whats how`.split(
    " "
  )
);

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const VOWELS = /[aeiouy]/;

/** Luhn checksum for card-number detection. */
function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

function looksSecretValue(value: string): boolean {
  const clean = value.replace(/^["'`]|["'`.,;!?]$/g, "");
  if (clean.length < 4) return false;
  const lower = clean.toLowerCase();
  // "my password is expired / wrong / not working" is a problem, not a secret.
  if (/^[a-z]+$/.test(clean) && (knownForm(lower) || GENERIC_WORDS.has(lower)))
    return false;
  if (/\d/.test(clean) || /[^a-z0-9]/i.test(clean)) return true;
  if (/[a-z]/.test(clean) && /[A-Z]/.test(clean)) return true;
  return !knownForm(lower);
}

/** Detects pasted credentials, card numbers, SSNs and API keys. */
export function detectSensitive(text: string): SensitiveType | null {
  if (/-----begin [a-z ]*private key-----/i.test(text)) return "private_key";
  if (
    /\bsk-(?:live|test|proj|ant)?[-_]?[a-z0-9]{16,}/i.test(text) ||
    /\bAKIA[0-9A-Z]{16}\b/.test(text) ||
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/.test(text) ||
    /\bxox[abprs]-[A-Za-z0-9-]{10,}/.test(text) ||
    /\bAIza[0-9A-Za-z_-]{30,}/.test(text) ||
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\./.test(text) ||
    /\bbearer\s+[a-z0-9._-]{12,}/i.test(text)
  ) {
    return "api_key";
  }
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) return "ssn";
  for (const match of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) {
      return "card";
    }
  }
  // Reuse the knowledge-base redactor as the first pass for credentials,
  // then confirm the value really looks like a secret.
  if (redactForLearning(text, 2000).summary.credential) {
    const pairs = text.matchAll(
      /\b(?:password|passwd|passcode|pwd|pin|token|api[- ]?key|secret|otp|mfa code|recovery key)\b\s*(is|was|[:=])\s*(\S+)/gi
    );
    for (const pair of pairs) {
      if (pair[1] === ":" || pair[1] === "=") {
        if (pair[2].replace(/["'`]/g, "").length >= 3) return "password";
      } else if (looksSecretValue(pair[2])) {
        return "password";
      }
    }
  }
  // Long, random-looking tokens (mixed case + digits) are probably keys.
  for (const token of text.split(/\s+/)) {
    if (
      token.length >= 32 &&
      /^[A-Za-z0-9+/_=-]+$/.test(token) &&
      /\d/.test(token) &&
      /[a-z]/.test(token) &&
      /[A-Z]/.test(token) &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(token)
    ) {
      return "api_key";
    }
  }
  return null;
}

function longestConsonantRun(token: string): number {
  let longest = 0;
  let run = 0;
  for (const char of token) {
    run = /[a-z]/.test(char) && !VOWELS.test(char) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

function unseenBigramRatio(token: string): number {
  const padded = `^${token}$`;
  let unseen = 0;
  const total = padded.length - 1;
  for (let index = 0; index < total; index += 1) {
    if (!BIGRAMS.has(padded.slice(index, index + 2))) unseen += 1;
  }
  return total ? unseen / total : 0;
}

/** Heuristic: does this unknown token look like keyboard mashing? */
export function isGibberishToken(raw: string): boolean {
  if (!/^[a-z]+$/.test(raw)) return false;
  const token = collapseRepeats(raw, 2);
  const squashed = collapseRepeats(raw, 1);
  if (knownForm(raw)) return false;
  // "jjjjjjj", "kkkkk": one or two letters held down.
  if (squashed.length < 3) return raw.length >= 4;
  if (correctTypo(raw)) return false;
  const uniqueChars = new Set(token).size;
  if (token.length >= 4 && uniqueChars <= 2) return true;
  if (
    token.length >= 4 &&
    KEYBOARD_ROWS.some((row) => [...token].every((char) => row.includes(char)))
  ) {
    return true;
  }
  const consonantRun = longestConsonantRun(token);
  if (consonantRun >= 6) return true;
  const vowels = [...token].filter((char) => VOWELS.test(char)).length;
  const vowelRatio = vowels / token.length;
  if (token.length >= 5 && (vowelRatio < 0.15 || vowelRatio > 0.85)) {
    return true;
  }
  const unseen = unseenBigramRatio(token);
  if (token.length >= 6 && unseen >= 0.25) return true;
  if (token.length >= 4 && unseen >= 0.4) return true;
  if (consonantRun >= 4 && unseen >= 0.15) return true;
  // Raw elongation of a non-word ("dfffffff", "zzzzzz").
  return raw.length - squashed.length >= 3 && token.length <= 4;
}

function isLaughter(token: string): boolean {
  return /^(?:ha|he|ah|ja|lo|l|x|d)+h?$/.test(token) && token.length >= 4;
}

/** Classify a requester message. */
export function classifyInput(
  text: string,
  options: ClassifyOptions = {}
): InputAssessment {
  const mode = options.mode ?? "problem";
  const base = { itTerms: [] as string[], gibberishTokens: [] as string[] };
  const trimmed = text.trim();
  if (!trimmed) return { ...base, kind: "empty", reason: "no text" };

  const sensitiveType = detectSensitive(trimmed);
  if (sensitiveType) {
    return {
      ...base,
      kind: "sensitive",
      sensitiveType,
      reason: `looks like a ${sensitiveType}`,
    };
  }

  const tokens = tokenize(trimmed);
  const alnum = tokens.join("");
  const itTerms: string[] = [];
  const gibberishTokens: string[] = [];
  const unknownTokens: string[] = [];
  let knownCount = 0;
  for (const token of tokens) {
    const domain =
      domainForm(token) ?? (knownForm(token) ? null : correctTypo(token));
    if (domain) {
      itTerms.push(domain);
      knownCount += 1;
      continue;
    }
    if (knownForm(token)) {
      knownCount += 1;
      continue;
    }
    if (/\d/.test(token)) continue; // error codes, model numbers
    unknownTokens.push(token);
    if (isGibberishToken(token) || isLaughter(token)) {
      gibberishTokens.push(token);
    }
  }
  const signals = { itTerms, gibberishTokens };

  const letters = alnum.replace(/[^a-z]/g, "");
  if (alnum.length < 2 || (letters.length === 0 && alnum.length < 4)) {
    return mode === "answer" && alnum.length > 0
      ? { ...signals, kind: "ok", reason: "short answer" }
      : { ...signals, kind: "too_short", reason: "fewer than two characters" };
  }

  const mashy =
    gibberishTokens.length > 0 &&
    itTerms.length === 0 &&
    (knownCount === 0 ||
      gibberishTokens.length / Math.max(1, tokens.length) >= 0.5);
  const laughterOnly =
    tokens.length > 0 && tokens.every((token) => isLaughter(token));

  if (mode === "answer") {
    return mashy && !laughterOnly
      ? { ...signals, kind: "gibberish", reason: "keyboard mashing" }
      : { ...signals, kind: "ok", reason: "answer" };
  }

  const squashed = tokens.map((token) => {
    const two = collapseRepeats(token, 2);
    const one = collapseRepeats(token, 1);
    return { raw: token, two, one };
  });
  const inSet = (set: Set<string>, item: (typeof squashed)[number]) =>
    set.has(item.raw) || set.has(item.two) || set.has(item.one);

  if (
    itTerms.length === 0 &&
    squashed.some((item) => inSet(GREETING_CORE, item)) &&
    squashed.every(
      (item) =>
        inSet(GREETING_CORE, item) ||
        inSet(GREETING_FILLER, item) ||
        inSet(SMALL_TALK, item)
    )
  ) {
    return { ...signals, kind: "greeting", reason: "greeting only" };
  }

  if (
    itTerms.length === 0 &&
    (laughterOnly ||
      (squashed.some((item) => inSet(SMALL_TALK_CORE, item)) &&
        squashed.every(
          (item) => inSet(SMALL_TALK, item) || isLaughter(item.raw)
        )))
  ) {
    return { ...signals, kind: "small_talk", reason: "small talk" };
  }

  if (mashy) {
    return { ...signals, kind: "gibberish", reason: "keyboard mashing" };
  }

  if (
    itTerms.length === 0 &&
    tokens.some(
      (token) => OFF_TOPIC.has(token) || OFF_TOPIC.has(stemLite(token))
    )
  ) {
    return { ...signals, kind: "off_topic", reason: "non-IT topic" };
  }
  if (
    itTerms.length === 0 &&
    /\b(?:tell me a joke|write (?:me )?an? (?:essay|poem|story)|capital of|who won)\b/i.test(
      trimmed
    )
  ) {
    return { ...signals, kind: "off_topic", reason: "non-IT request" };
  }

  const content = tokens.filter(
    (token) =>
      !GENERIC_WORDS.has(token) &&
      !GENERIC_WORDS.has(collapseRepeats(token, 1)) &&
      !(COMMON_WORDS.has(token) && token.length <= 3)
  );
  if (itTerms.length === 0 && content.length === 0) {
    return { ...signals, kind: "too_short", reason: "no descriptive words" };
  }
  if (
    itTerms.length === 0 &&
    tokens.length === 1 &&
    collapseRepeats(tokens[0], 1).length <= 3 &&
    !knownForm(tokens[0])
  ) {
    return { ...signals, kind: "too_short", reason: "single short token" };
  }
  if (
    itTerms.length === 0 &&
    knownCount === 0 &&
    unknownTokens.length > 0 &&
    unknownTokens.every((token) => unseenBigramRatio(token) >= 0.2)
  ) {
    return { ...signals, kind: "gibberish", reason: "no recognisable words" };
  }

  return { ...signals, kind: "ok", reason: "looks like a description" };
}

function stemLite(token: string): string {
  return token.endsWith("s") ? token.slice(0, -1) : token;
}

/**
 * Non-blocking hint shown under the composer while typing.
 * Returns null when there is nothing useful to say.
 */
export function inputHint(
  text: string,
  options: ClassifyOptions = {}
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const result = classifyInput(trimmed, options);
  switch (result.kind) {
    case "sensitive":
      return "That looks like a password or secret — please don’t share it here.";
    case "gibberish":
      return "That doesn’t look like a problem description yet.";
    case "greeting":
      return "Hi! Add what’s going wrong, e.g. “printer is offline”.";
    case "small_talk":
      return "Tell me what isn’t working and I’ll find an approved guide.";
    case "off_topic":
      return "I can only help with IT problems like Wi-Fi, email or printers.";
    case "too_short":
      return trimmed.length >= 3
        ? "Add a little more detail — what device, and what’s happening?"
        : null;
    default:
      return null;
  }
}
