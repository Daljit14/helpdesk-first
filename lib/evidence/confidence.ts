import type { TestRef } from "./types";

export const REJECTING_PENALTY = 0.15;
export const SUPPORTING_BONUS = 0.05;
export const MAX_SUPPORTING_UPLIFT = 0.1;
export const CONTRADICTORY_CAP = 0.6;
export const MIN_CONFIDENCE = 0.05;
export const MAX_CONFIDENCE = 0.95;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function adjustConfidence(
  raw: number,
  supporting: TestRef[],
  rejecting: TestRef[]
): { confidence: number; explanation: string } {
  const uplift = Math.min(
    supporting.length * SUPPORTING_BONUS,
    MAX_SUPPORTING_UPLIFT
  );
  const penalty = rejecting.length * REJECTING_PENALTY;
  let confidence = raw + uplift - penalty;
  if (supporting.length > 0 && rejecting.length > 0) {
    confidence = Math.min(confidence, CONTRADICTORY_CAP);
  }
  confidence = rounded(
    Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, confidence))
  );
  const rejectText = `${rejecting.length} rejecting test${
    rejecting.length === 1 ? "" : "s"
  } (−${penalty.toFixed(2)})`;
  const supportText = `${supporting.length} supporting (+${uplift.toFixed(2)})`;
  const contradictory =
    supporting.length > 0 && rejecting.length > 0
      ? `; contradictory evidence capped at ${CONTRADICTORY_CAP.toFixed(2)}`
      : "";
  return {
    confidence,
    explanation: `Likely cause. Started at ${raw.toFixed(2)}; ${rejectText}, ${supportText}${contradictory}.`,
  };
}
