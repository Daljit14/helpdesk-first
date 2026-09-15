import { createHash } from "node:crypto";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function parameterHash(input: {
  capabilityId: string;
  version: number;
  parameters: Record<string, unknown>;
}): string {
  return createHash("sha256")
    .update(
      canonical({
        capabilityId: input.capabilityId,
        version: input.version,
        parameters: input.parameters,
      })
    )
    .digest("hex");
}
