import {
  redactForLearning,
  type RedactionSummary,
} from "@/lib/knowledge/learning-redaction";

export type EvidenceRedaction = {
  text: string;
  summary: RedactionSummary;
};

export function redactEvidenceText(
  text: string,
  max = 1000
): EvidenceRedaction {
  return redactForLearning(text, max);
}
