import type { Hypothesis } from "@/lib/ai/types";
import { adjustConfidence } from "./confidence";
import { neutraliseCertainty } from "./wording";
import type { EvidenceHypothesis, TestRef } from "./types";

export function buildHypotheses(
  sourceHypotheses: Hypothesis[],
  tests: TestRef[]
): EvidenceHypothesis[] {
  return sourceHypotheses
    .map((hypothesis, index) => {
      const guideSlug = hypothesis.guideSlug ?? null;
      const supporting = guideSlug
        ? tests.filter(
            (test) =>
              test.result === "supports" && test.id.startsWith(`${guideSlug}#`)
          )
        : [];
      const rejecting = guideSlug
        ? tests.filter(
            (test) =>
              test.result === "rejects" && test.id.startsWith(`${guideSlug}#`)
          )
        : [];
      const adjusted = adjustConfidence(
        hypothesis.confidence,
        supporting,
        rejecting
      );
      return {
        id: `h${index}`,
        cause: neutraliseCertainty(hypothesis.cause),
        guideSlug,
        rawConfidence: hypothesis.confidence,
        confidence: adjusted.confidence,
        explanation: neutraliseCertainty(adjusted.explanation),
        supporting,
        rejecting,
      };
    })
    .sort((left, right) => right.confidence - left.confidence);
}
