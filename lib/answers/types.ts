export type SourceTier =
  "org_approved" | "vendor" | "reference" | "qa_community" | "community";

export const TIER_RANK: Record<SourceTier, number> = {
  org_approved: 0,
  vendor: 1,
  reference: 2,
  qa_community: 3,
  community: 4,
};

export type AnswerProviderId =
  "brave" | "tavily" | "wikipedia" | "stackexchange";

export type AnswerSource = {
  id: string;
  provider: AnswerProviderId;
  url: string;
  domain: string;
  title: string;
  text: string;
  tier: SourceTier;
  fetched: boolean;
  attribution: string | null;
};

export type AnswerSourceDraft = Pick<
  AnswerSource,
  "provider" | "url" | "domain" | "title" | "text" | "attribution"
>;

export type AnswerProvider = {
  readonly id: AnswerProviderId;
  search(query: string, signal: AbortSignal): Promise<AnswerSourceDraft[]>;
};

export type AnswerItem = { text: string; sourceIds: string[] };

export type AnswerStep = AnswerItem & {
  kind: "official" | "community";
  tiers: SourceTier[];
  independentDomains: number;
  confidence: number;
};

export type Answer = {
  likelyCause: AnswerItem | null;
  explanations: AnswerItem[];
  steps: AnswerStep[];
  confidence: number;
  topTier: SourceTier | null;
};

export type AnswerEngineStatus =
  | "disabled"
  | "input_blocked"
  | "no_sources"
  | "unavailable"
  | "low_confidence"
  | "answered";

export type PublicAnswerSource = Pick<
  AnswerSource,
  "id" | "title" | "domain" | "url" | "tier" | "attribution"
>;

export type AnswerEngineResult = {
  status: AnswerEngineStatus;
  runId: string | null;
  answer: Answer | null;
  sources: PublicAnswerSource[];
  cached: boolean;
  droppedClaims: number;
};
