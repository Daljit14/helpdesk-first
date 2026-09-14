import { detectSensitiveTopic } from "@/lib/knowledge/learning-eligibility";
import type { RedactionSummary } from "@/lib/knowledge/learning-redaction";
import type { DiagnosticAnswer } from "@/lib/ai/types";

export function deriveSafetyWarnings(input: {
  description: string;
  redaction: RedactionSummary;
  qa: DiagnosticAnswer[];
}): string[] {
  const text = [
    input.description,
    ...input.qa.map(({ answer }) => answer),
  ].join("\n");
  const warnings: string[] = [];
  const sensitiveTopic = detectSensitiveTopic(text);
  if (sensitiveTopic) {
    warnings.push(
      `Sensitive topic detected: ${sensitiveTopic} — escalate, do not automate.`
    );
  }
  if ((input.redaction.credential ?? 0) > 0) {
    warnings.push("Credential-like content was removed from the description.");
  }
  const ownershipText = input.qa
    .filter(
      ({ questionId }) =>
        questionId === "network-owner" || questionId === "account-managed"
    )
    .map(({ answer }) => answer)
    .join(" ");
  if (/(work|school|company|organi[sz]ation|managed|IT)/i.test(ownershipText)) {
    warnings.push(
      "Device/account is organisation-managed; changes may require approval."
    );
  }
  return warnings;
}
