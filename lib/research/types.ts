export type ResearchProviderId = "tavily" | "brave";
export type TrustTier = "vendor" | "community";

export interface ResearchSource {
  url: string;
  domain: string;
  title: string;
  snippet: string;
  trust: TrustTier;
  contentHash: string;
  fetchedAt: string;
}

export type ResearchResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        kind:
          | "timeout"
          | "rate_limited"
          | "unavailable"
          | "invalid_response"
          | "too_large"
          | "unauthorized";
        message: string;
      };
    };

export interface ResearchProvider {
  readonly id: ResearchProviderId;
  search(
    query: string,
    signal: AbortSignal
  ): Promise<ResearchResult<ResearchSource[]>>;
}

export type Judgement = "supports" | "contradicts" | "irrelevant" | "unjudged";

export interface JudgedSource extends ResearchSource {
  judgement: Judgement;
  hypothesisId: string | null;
}

export type ResearchOutcome = {
  status: "ran" | "skipped";
  reason?: string;
  sources: JudgedSource[];
  queries: string[];
};
