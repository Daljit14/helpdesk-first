import type { ResearchProvider, ResearchResult, ResearchSource } from "./types";
type FailureKind = Extract<
  ResearchResult<ResearchSource[]>,
  { ok: false }
>["error"]["kind"];

export class FakeResearchProvider implements ResearchProvider {
  readonly id = "tavily" as const;
  calls = 0;
  constructor(
    private readonly results: ResearchSource[] = [],
    private readonly failure: FailureKind | null = null
  ) {}
  async search(): Promise<ResearchResult<ResearchSource[]>> {
    this.calls += 1;
    return this.failure
      ? {
          ok: false,
          error: { kind: this.failure, message: "fake research failure" },
        }
      : { ok: true, value: this.results };
  }
}
