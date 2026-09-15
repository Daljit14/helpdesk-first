export type SanitizedOutput = Record<string, string | number | boolean | null>;

function cleanString(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim()
    .slice(0, 200);
}

export function sanitizeOutput(raw: unknown): SanitizedOutput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const output: SanitizedOutput = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") output[key] = cleanString(value);
    else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      output[key] = value;
    }
  }
  return output;
}
