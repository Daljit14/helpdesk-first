import { createHash } from "node:crypto";

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

export function buildIdempotencyKey(input: {
  runId: string;
  stepId: string;
  capabilityId: string;
  capabilityVersion: number;
  parameters: unknown;
}): string {
  const payload = canonicalize(input);
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
