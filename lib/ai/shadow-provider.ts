import type { AiIntakeInput, AiIntakeOutput, AiProvider } from "./types";

export type ShadowComparison = {
  agreeDecision: boolean;
  agreeSlug: boolean;
  primaryDecision: AiIntakeOutput["decision"];
  shadowDecision: AiIntakeOutput["decision"] | null;
  shadowError: string | null;
};

export class ShadowAiProvider implements AiProvider {
  constructor(
    private readonly primary: AiProvider,
    private readonly shadow: AiProvider,
    private readonly onCompare: (comparison: ShadowComparison) => void
  ) {}

  async classify(
    input: AiIntakeInput,
    options?: { signal?: AbortSignal }
  ): Promise<AiIntakeOutput> {
    const primaryOutput = await this.primary.classify(input, options);
    void this.shadow
      .classify(input, options)
      .then((shadowOutput) => {
        this.onCompare({
          agreeDecision: primaryOutput.decision === shadowOutput.decision,
          agreeSlug:
            primaryOutput.matchedIssueSlug === shadowOutput.matchedIssueSlug,
          primaryDecision: primaryOutput.decision,
          shadowDecision: shadowOutput.decision,
          shadowError: null,
        });
      })
      .catch((error: unknown) => {
        this.onCompare({
          agreeDecision: false,
          agreeSlug: false,
          primaryDecision: primaryOutput.decision,
          shadowDecision: null,
          shadowError: error instanceof Error ? error.message : "shadow error",
        });
      });
    return primaryOutput;
  }
}
