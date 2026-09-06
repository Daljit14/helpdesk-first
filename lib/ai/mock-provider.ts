import { CATEGORIES, ISSUES, type Issue } from "@/lib/issues";
import type { Platform } from "@/lib/helpdesk-data";
import type { AiIntakeInput, AiIntakeOutput, AiProvider } from "./types";
import { diagnosticQuestions } from "./types";
import { getSafeResponseLimit, isPasswordRecovery } from "./safety-policy";

const MATCH_SCORE_THRESHOLD = 1.5;
const MATCH_GAP_THRESHOLD = 0.3;
const MIN_SCORE_FOR_CLARIFY = 1;
const MAX_QUESTIONS = 3;

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
  "not",
  "no",
  "wont",
  "cant",
  "cannot",
  "doesnt",
  "isnt",
  "dont",
  "working",
  "work",
  "works",
  "problem",
  "issue",
  "help",
  "please",
  "keeps",
  "keep",
  "still",
  "just",
  "really",
  "very",
  "anymore",
  "since",
  "today",
  "get",
  "getting",
  "got",
  "im",
  "its",
  "any",
  "some",
  "there",
  "here",
  "up",
  "out",
  "off",
  "again",
  "also",
  "now",
  "run",
  "lately",
]);

const SYNONYMS: Record<string, string> = {
  wifi: "wifi",
  "wi-fi": "wifi",
  wireless: "wifi",
  internet: "internet",
  online: "internet",
  web: "internet",
  connection: "internet",
  email: "email",
  mail: "email",
  outlook: "email",
  gmail: "email",
  inbox: "email",
  outbox: "email",
  laptop: "computer",
  computer: "computer",
  pc: "computer",
  desktop: "computer",
  machine: "computer",
  printer: "print",
  print: "print",
  printing: "print",
  prints: "print",
  slow: "slow",
  lag: "slow",
  laggy: "slow",
  slowly: "slow",
  sluggish: "slow",
  password: "password",
  passcode: "password",
  pwd: "password",
  login: "signin",
  log: "signin",
  signin: "signin",
  sign: "signin",
  camera: "camera",
  webcam: "camera",
  mic: "mic",
  microphone: "mic",
  mouse: "mouse",
  trackpad: "touchpad",
  touchpad: "touchpad",
  disconnecting: "disconnect",
  disconnect: "disconnect",
  drops: "disconnect",
  dropping: "disconnect",
  drop: "disconnect",
  crash: "crash",
  crashing: "crash",
  crashes: "crash",
  frozen: "freeze",
  freeze: "freeze",
  freezing: "freeze",
  hang: "freeze",
  hangs: "freeze",
  stuck: "freeze",
  unresponsive: "freeze",
  responding: "freeze",
  sound: "sound",
  audio: "sound",
  speaker: "sound",
  speakers: "sound",
  volume: "sound",
  hear: "sound",
  meeting: "meeting",
  zoom: "meeting",
  teams: "meeting",
  webex: "meeting",
  call: "meeting",
  calls: "meeting",
  phone: "phone",
  iphone: "phone",
  android: "phone",
  mobile: "phone",
  cell: "phone",
  storage: "storage",
  space: "storage",
  disk: "storage",
  full: "storage",
  virus: "antivirus",
  malware: "antivirus",
  antivirus: "antivirus",
  popup: "popup",
  popups: "popup",
  pop: "popup",
  cable: "ethernet",
  wired: "ethernet",
  ethernet: "ethernet",
  sync: "sync",
  syncing: "sync",
  synchronize: "sync",
  share: "share",
  sharing: "share",
  shared: "share",
  attachment: "attachment",
  attachments: "attachment",
  update: "update",
  updating: "update",
  updates: "update",
  upgrade: "update",
  install: "install",
  installation: "install",
  installing: "install",
  delete: "lost",
  deleted: "lost",
  lost: "lost",
  missing: "lost",
  recover: "lost",
  recovery: "lost",
  locked: "locked",
  lockout: "locked",
  lock: "locked",
  slack: "chat",
  chat: "chat",
  channel: "chat",
  onedrive: "drive",
  dropbox: "drive",
  sharepoint: "drive",
  drive: "drive",
  "2fa": "2fa",
  mfa: "2fa",
  authenticator: "2fa",
  verification: "2fa",
  code: "2fa",
  jam: "jam",
  jammed: "jam",
  battery: "battery",
  charge: "battery",
  charging: "battery",
  drain: "battery",
  draining: "battery",
  drains: "battery",
  dock: "dock",
  docking: "dock",
  hijacked: "hijack",
  hijack: "hijack",
  redirect: "hijack",
  stolen: "stolen",
  theft: "stolen",
  encrypted: "encryption",
  encryption: "encryption",
  tiny: "resolution",
  small: "resolution",
  huge: "resolution",
  blurry: "resolution",
  scaling: "resolution",
  resolution: "resolution",
  start: "start",
  boot: "start",
  turn: "start",
  power: "start",
  restart: "restart",
  reboot: "restart",
  restarted: "restart",
  expired: "expired",
  expire: "expired",
  forgot: "forgot",
  forgotten: "forgot",
  invite: "invite",
  invitation: "invite",
  invites: "invite",
  notification: "notification",
  notifications: "notification",
  alerts: "notification",
  alert: "notification",
  connect: "internet",
  connected: "internet",
  connecting: "internet",
  show: "device",
  showing: "device",
  shows: "device",
  detected: "recognize",
  detect: "recognize",
  recognized: "recognize",
  recognition: "recognize",
};

const ISSUE_BOOSTS: Partial<
  Record<string, { all?: RegExp[]; none?: RegExp[]; score: number }[]>
> = {
  "no-internet": [
    {
      all: [
        /\b(no|not|cannot|can['’]?t|unable|offline)\b/i,
        /\b(internet|online|web|connection|connect)\b/i,
      ],
      none: [/\b(vpn|wifi|wireless|ethernet|cable)\b/i],
      score: 2,
    },
  ],
  "ethernet-not-working": [
    {
      all: [/\b(ethernet|wired|cable)\b/i],
      score: 2,
    },
  ],
  "usb-device-not-recognized": [
    {
      all: [
        /\busb\b/i,
        /\b(show|showing|shows|detect|detected|recognize|recognized)\b/i,
      ],
      none: [/\b(security|policy|blocked|warning)\b/i],
      score: 1,
    },
  ],
};

type IssueDocument = {
  issue: Issue;
  titleTokens: string[];
  idTokens: string[];
  tokenWeights: Map<string, number>;
};

const ISSUE_DOCUMENTS = ISSUES.map(buildIssueDocument);
const DOCUMENT_FREQUENCIES = new Map<string, number>();
for (const document of ISSUE_DOCUMENTS) {
  for (const token of document.tokenWeights.keys()) {
    DOCUMENT_FREQUENCIES.set(token, (DOCUMENT_FREQUENCIES.get(token) ?? 0) + 1);
  }
}

const DOCUMENT_IDF = new Map(
  [...DOCUMENT_FREQUENCIES].map(([token, frequency]) => [
    token,
    1 / (1 + Math.log(frequency)),
  ])
);

export class MockAiProvider implements AiProvider {
  async classify(
    input: AiIntakeInput,
    options?: { signal?: AbortSignal }
  ): Promise<AiIntakeOutput> {
    const output = await this.classifyInternal(input, options);
    if (output.confidence !== undefined) return output;
    return {
      ...output,
      confidence:
        output.decision === "match"
          ? 0.9
          : output.decision === "clarify"
            ? 0.5
            : 0.2,
    };
  }

  private async classifyInternal(
    input: AiIntakeInput,
    options?: { signal?: AbortSignal }
  ): Promise<AiIntakeOutput> {
    if (options?.signal?.aborted) {
      return {
        decision: "escalate",
        escalationReason: "AI request was cancelled.",
      };
    }

    const combined = buildCombinedText(input);

    const hasEmailContext =
      /\b(email|mail|outlook|gmail|webmail|inbox)\b/i.test(combined) ||
      /\bofficial\s+website\b/i.test(combined);
    if (isPasswordRecovery(combined) && hasEmailContext) {
      const detectedPlatform = input.platform ?? detectPlatform(combined);
      if (!detectedPlatform) {
        return {
          decision: "clarify",
          detectedPlatform: null,
          diagnosticQuestionIds: ["which-platform"],
          explanation:
            "To route you to the email sign-in guide, please let me know which device or operating system you are using.",
        };
      }
      return {
        decision: "match",
        matchedIssueSlug: "email-sign-in",
        detectedPlatform,
        explanation:
          "It sounds like you need help with your email sign-in. Please follow the approved email sign-in guide; never enter your password into any unofficial site.",
      };
    }

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
      (gap >= MATCH_GAP_THRESHOLD || confidence >= second.score * 1.3)
    ) {
      return {
        decision: "match",
        matchedIssueSlug: top.issue.id,
        detectedPlatform,
        explanation: `Based on your description, this looks like "${top.issue.title}" for ${detectedPlatform ?? "your device"}. I can start the approved troubleshooting guide for that issue.`,
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
      sorted.slice(0, 3).map((s) => s.issue.category),
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
  if (/\biphone\b|\bios\b|\bipad\b/i.test(normalized)) return "iOS";
  if (/\bandroid\b/i.test(normalized)) return "Android";
  if (/\bmobile\b|\bphone\b/i.test(normalized)) return null;
  if (/\bother\b|\blinux\b|\bchromebook\b/i.test(normalized)) {
    return "Other";
  }
  return null;
}

type ScoredIssue = {
  issue: Issue;
  score: number;
};

function buildIssueDocument(issue: Issue): IssueDocument {
  const tokenWeights = new Map<string, number>();
  const addTokens = (value: string, weight: number) => {
    for (const token of tokenize(value)) {
      tokenWeights.set(token, Math.max(tokenWeights.get(token) ?? 0, weight));
    }
  };

  addTokens(issue.title, 3);
  addTokens(issue.id.replace(/-/g, " "), 3);
  addTokens(
    CATEGORIES.find((category) => category.id === issue.category)?.label ??
      issue.category,
    1
  );
  for (const symptom of issue.symptoms) addTokens(symptom, 1.5);

  return {
    issue,
    titleTokens: phraseTokens(issue.title),
    idTokens: phraseTokens(issue.id.replace(/-/g, " ")),
    tokenWeights,
  };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeToken)
    .filter((token) => !STOP_WORDS.has(token));
}

function phraseTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeToken);
}

function normalizeToken(token: string): string {
  return (
    SYNONYMS[stem(SYNONYMS[token] ?? token)] ?? stem(SYNONYMS[token] ?? token)
  );
}

function stem(token: string): string {
  if (token.endsWith("ies") && token.length - 2 >= 3) {
    return token.slice(0, -3) + "y";
  }
  for (const suffix of ["ing", "es", "s", "ed"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

function scoreIssues(text: string, platform: Platform | null): ScoredIssue[] {
  const messageTokens = [
    ...new Set(tokenize(text).filter((token) => !isPlatformToken(token))),
  ];
  const hasMeaningfulTokens = messageTokens.length > 0;
  const normalizedTitleText = phraseTokens(text);
  const normalizedText = text.toLowerCase();

  return ISSUE_DOCUMENTS.map((document) => {
    let score = 0;
    for (const messageToken of messageTokens) {
      const exactWeight = document.tokenWeights.get(messageToken);
      if (exactWeight !== undefined) {
        score += exactWeight * (DOCUMENT_IDF.get(messageToken) ?? 1);
        continue;
      }

      let fuzzyWeight = 0;
      let fuzzyToken = "";
      for (const [documentToken, fieldWeight] of document.tokenWeights) {
        if (
          messageToken.length >= 5 &&
          documentToken.length >= 5 &&
          levenshteinDistance(messageToken, documentToken) <= 1 &&
          fieldWeight > fuzzyWeight
        ) {
          fuzzyWeight = fieldWeight;
          fuzzyToken = documentToken;
        }
      }
      if (fuzzyWeight > 0) {
        score += fuzzyWeight * 0.7 * (DOCUMENT_IDF.get(fuzzyToken) ?? 1);
      }
    }

    if (
      document.titleTokens.length >= 4 &&
      containsPhrase(normalizedTitleText, document.titleTokens)
    ) {
      score += 8;
    }
    if (containsPhrase(normalizedTitleText, document.idTokens)) {
      score += 0.4;
    }
    for (const boost of ISSUE_BOOSTS[document.issue.id] ?? []) {
      if (
        boost.all?.every((regex) => regex.test(normalizedText)) !== false &&
        !boost.none?.some((regex) => regex.test(normalizedText))
      ) {
        score += boost.score;
      }
    }
    if (
      hasMeaningfulTokens &&
      platform &&
      document.issue.devices.includes(platform)
    ) {
      score += 0.5;
    }
    return { issue: document.issue, score };
  });
}

function isPlatformToken(token: string): boolean {
  return new Set([
    "window",
    "windows",
    "win10",
    "win11",
    "mac",
    "macbook",
    "macos",
    "os",
    "apple",
    "other",
    "linux",
    "chromebook",
  ]).has(token);
}

function containsPhrase(tokens: string[], phrase: string[]): boolean {
  if (phrase.length === 0 || phrase.length > tokens.length) return false;
  for (let index = 0; index <= tokens.length - phrase.length; index++) {
    if (phrase.every((token, offset) => tokens[index + offset] === token)) {
      return true;
    }
  }
  return false;
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let current = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(
        previous[j] + 1,
        current + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous[j - 1] = current;
      current = next;
    }
    previous[b.length] = current;
  }
  return previous[b.length];
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
      if (question.categoryIds && !question.categoryIds.includes(categoryId)) {
        continue;
      }
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
