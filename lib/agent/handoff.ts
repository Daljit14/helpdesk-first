import { handoffReasonFor } from "./session";
import { toUserText, type OutputGuardContext } from "./output-guard";
import type { HandoffReason } from "@/lib/tickets/routing";

export type HandoffFacts = {
  reason: string;
  problem: string;
  checked: string[];
  tried: string[];
  answers: string[];
};

const READABLE_REASONS: Partial<Record<HandoffReason, string>> = {
  user_requested_human: "The requester asked to speak with a person.",
  security_concern: "A safety check needs a person to review this.",
  repeated_failure: "Several attempts did not resolve the issue.",
  low_confidence: "The assistant could not confirm a reliable answer.",
  agent_halted: "The assistant could not finish this safely.",
} as const;

function cutAtWord(value: string, max: number): string {
  const text = value.trim();
  if (text.length <= max) return text;
  const prefix = text.slice(0, max + 1);
  const boundary = prefix.lastIndexOf(" ");
  return prefix.slice(0, boundary > 0 ? boundary : max).trim();
}

export function buildHandoff(
  facts: HandoffFacts,
  outputGuard: OutputGuardContext
): { staffLines: string[]; userLine: string } {
  const clean = (value: string) => toUserText(value, outputGuard).trim();
  const problem = clean(facts.problem);
  const checked = facts.checked.map(clean).filter(Boolean);
  const tried = facts.tried.map(clean).filter(Boolean);
  const answers = facts.answers
    .map((answer) => clean(answer).slice(0, 120))
    .filter(Boolean)
    .slice(-2);
  const reason =
    READABLE_REASONS[handoffReasonFor(facts.reason, "escalated")] ??
    "The assistant could not finish this safely.";
  const staffLines = [
    clean(`Problem: ${problem}`).slice(0, 200),
    ...(checked.length > 0
      ? [clean(`Checked: ${checked.slice(0, 3).join("; ")}`).slice(0, 200)]
      : []),
    ...(tried.length > 0
      ? [clean(`Tried: ${tried.slice(0, 3).join("; ")}`).slice(0, 200)]
      : []),
    ...(answers.length > 0
      ? [clean(`User said: ${answers.join(" / ")}`).slice(0, 200)]
      : []),
    clean(`Why passed on: ${reason}`).slice(0, 200),
  ];
  if (staffLines.length < 3)
    staffLines.splice(1, 0, clean("Checked: nothing yet").slice(0, 200));

  const problemForUser = cutAtWord(problem, 80);
  const checksPhrase = checked.length
    ? `, and the ${checked.length} check${checked.length === 1 ? "" : "s"} I ran`
    : "";
  const userLine = clean(
    `Here's what I passed on: "${problemForUser}"${checksPhrase}. A support person will pick this up, and you won't need to repeat yourself.`
  );

  return { staffLines: staffLines.slice(0, 5), userLine };
}
