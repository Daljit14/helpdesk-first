import {
  ISSUES,
  CATEGORIES,
  type Issue,
  type Device,
  type IssueCategoryId,
} from "./issues";
import { resolveIssueId } from "./legacy-slugs";

export type IssueFilters = {
  query?: string;
  categoryId?: string | null;
  platform?: Device | null;
};

const SYNONYMS: Record<string, string[]> = {
  pc: ["computer", "laptop", "desktop", "windows"],
  laptop: ["computer", "pc", "notebook"],
  computer: ["pc", "laptop", "desktop"],
  hang: ["freeze", "freezing", "frozen", "stuck", "unresponsive", "slow"],
  hangs: ["freeze"],
  hanging: ["freeze"],
  hung: ["freeze"],
  frozen: ["freeze"],
  freezes: ["freeze"],
  stuck: ["freeze", "not responding"],
  slow: ["performance", "lag", "freezing"],
  lag: ["slow"],
  lagging: ["slow"],
  wifi: ["wi-fi", "wireless", "network", "internet"],
  "wi-fi": ["wifi", "wireless", "internet"],
  internet: ["network", "wi-fi", "online", "connection"],
  net: ["internet", "network"],
  mail: ["email", "outlook"],
  email: ["outlook", "mail"],
  outlook: ["email"],
  screen: ["display", "monitor"],
  monitor: ["display", "screen"],
  display: ["screen", "monitor"],
  sound: ["audio", "speaker", "volume"],
  audio: ["sound", "speaker", "microphone"],
  mic: ["microphone", "audio"],
  cam: ["camera", "webcam"],
  webcam: ["camera"],
  login: ["sign in", "log in", "password"],
  signin: ["sign in", "login"],
  pwd: ["password"],
  pass: ["password"],
  print: ["printer", "printing"],
  printer: ["print"],
  bluetooth: ["wireless", "headphones"],
  battery: ["charging", "power"],
  charge: ["charging", "battery", "power"],
  boot: ["startup", "turn on", "power"],
  start: ["startup", "boot", "turn on"],
  crash: ["crashing", "closes", "error"],
  crashes: ["crash"],
  crashing: ["crash"],
  virus: ["malware", "security", "popup"],
  popup: ["ads", "malware"],
  blue: ["blue screen", "bsod"],
  bsod: ["blue screen"],
  zoom: ["video call", "meeting"],
  teams: ["video call", "meeting"],
  vpn: ["remote", "network"],
  update: ["updates", "upgrade", "windows update"],
  storage: ["disk", "space", "full"],
  disk: ["storage", "space"],
  keyboard: ["keys", "typing"],
  mouse: ["trackpad", "touchpad", "cursor"],
  touchpad: ["trackpad", "mouse"],
  usb: ["port", "device", "drive"],
  file: ["document", "files", "folder"],
  files: ["file", "documents"],
  drive: ["shared drive", "onedrive", "storage"],
};
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "i",
  "is",
  "my",
  "not",
  "the",
  "to",
]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function stem(value: string): string {
  for (const suffix of ["ing", "es", "ed", "s"]) {
    if (value.endsWith(suffix) && value.length - suffix.length >= 3) {
      return value.slice(0, -suffix.length);
    }
  }
  return value;
}

function expansions(token: string): string[] {
  return [...new Set([token, stem(token), ...(SYNONYMS[token] ?? [])])]
    .map((value) => normalize(value))
    .flatMap((value) => [value, stem(value)])
    .filter(Boolean);
}

function categoryLabel(id: IssueCategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(normalize)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

function issueHaystack(issue: Issue): {
  text: string;
  words: string[];
  content: { text: string; words: string[] };
  category: string;
} {
  const fields = [issue.id, issue.title, ...issue.symptoms, ...issue.devices];
  return {
    text: normalize(fields.join(" ")),
    words: fields.flatMap((field) =>
      field
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(normalize)
        .filter(Boolean)
    ),
    content: {
      text: normalize(fields.join(" ")),
      words: fields.flatMap((field) =>
        field
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .map(normalize)
          .filter(Boolean)
      ),
    },
    category: normalize(categoryLabel(issue.category)),
  };
}

function includesTerm(
  haystack: { text: string; words: string[] },
  term: string
) {
  return term.length < 3
    ? haystack.words.includes(term)
    : haystack.text.includes(term);
}

function matchesExpansion(
  haystack: ReturnType<typeof issueHaystack>,
  terms: string[]
) {
  return terms.some(
    (term, index) =>
      includesTerm(index > 1 ? haystack.content : haystack, term) ||
      (index < 2 && term === haystack.category)
  );
}

function queryScore(
  issue: Issue,
  rawQuery: string,
  includeSynonyms = true
): number {
  const query = rawQuery.trim();
  if (!query) return 0;

  const tokens = queryTokens(query);

  if (tokens.length === 0) return 0;

  const haystack = issueHaystack(issue);
  return tokens.reduce(
    (score, token) =>
      score +
      (matchesExpansion(
        haystack,
        includeSynonyms ? expansions(token) : [token, stem(token)]
      )
        ? 1
        : 0),
    0
  );
}

function queryQuality(issue: Issue, rawQuery: string): number {
  const haystack = issueHaystack(issue);
  return rawQuery
    .toLowerCase()
    .split(/\s+/)
    .map(normalize)
    .filter((token) => Boolean(token) && !STOP_WORDS.has(token))
    .reduce((quality, token) => {
      const match = expansions(token).findIndex(
        (term, index) =>
          includesTerm(index > 1 ? haystack.content : haystack, term) ||
          (index < 2 && term === haystack.category)
      );
      return quality + (match === -1 ? expansions(token).length : match);
    }, 0);
}

function titleScore(issue: Issue, rawQuery: string): number {
  const title = {
    text: normalize(issue.title),
    words: issue.title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map(normalize)
      .filter(Boolean),
  };
  return rawQuery
    .toLowerCase()
    .split(/\s+/)
    .map(normalize)
    .filter((token) => Boolean(token) && !STOP_WORDS.has(token))
    .reduce(
      (score, token) =>
        score +
        (expansions(token).some((term) => includesTerm(title, term)) ? 1 : 0),
      0
    );
}

export function filterIssues(filters: IssueFilters): Issue[] {
  const { query = "", categoryId = null, platform = null } = filters;

  const candidates = ISSUES.filter((issue) => {
    if (categoryId && issue.category !== categoryId) {
      return false;
    }

    if (platform && !issue.devices.includes(platform)) {
      return false;
    }

    return true;
  });
  if (!query.trim()) return candidates;
  const tokenCount = queryTokens(query).length;
  const exact = candidates
    .map((issue) => ({
      issue,
      score: queryScore(issue, query, false),
      quality: queryQuality(issue, query),
      titleScore: titleScore(issue, query),
    }))
    .filter(({ score }) => score === tokenCount);
  if (exact.length > 0) {
    return exact
      .sort(
        (left, right) =>
          right.titleScore - left.titleScore ||
          left.quality - right.quality ||
          left.issue.title.localeCompare(right.issue.title)
      )
      .map(({ issue }) => issue);
  }
  const scored = candidates
    .map((issue) => ({
      issue,
      score: queryScore(issue, query),
      quality: queryQuality(issue, query),
      titleScore: titleScore(issue, query),
    }))
    .filter(({ score }) => score > 0);
  const all = scored.filter(({ score }) => score === tokenCount);
  if (
    all.length === 0 &&
    !query
      .toLowerCase()
      .split(/\s+/)
      .some((token) => SYNONYMS[normalize(token)])
  ) {
    return [];
  }
  return (all.length > 0 ? all : scored)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.titleScore - left.titleScore ||
        left.quality - right.quality ||
        left.issue.title.localeCompare(right.issue.title)
    )
    .map(({ issue }) => issue);
}

export function getIssueBySlug(slug: string): Issue | undefined {
  return ISSUES.find((issue) => issue.id === resolveIssueId(slug));
}

export function getAllIssueSlugs(): string[] {
  return ISSUES.map((issue) => issue.id);
}
