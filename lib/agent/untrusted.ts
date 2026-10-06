import { guardModelInput } from "@/lib/autonomy/guardrails/input";
import { detectInstructionContent } from "./tripwires";

export const INSTRUCTION_WITHHELD =
  "[content contained instructions and was withheld]";

function withholdInstructions(value: unknown): unknown {
  if (typeof value === "string")
    return detectInstructionContent(value) ? INSTRUCTION_WITHHELD : value;
  if (Array.isArray(value)) return value.map(withholdInstructions);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        withholdInstructions(child),
      ])
    );
  }
  return value;
}

export function wrapUntrusted(source: string, value: unknown): string {
  const raw = JSON.stringify(value ?? null);
  const guarded = guardModelInput([{ source: "event", text: raw }]);
  if (guarded.blocked) throw new Error("injection_in_tool_output");
  let shaped: unknown = guarded.fields[0]?.text ?? "";
  try {
    shaped = JSON.parse(String(shaped)) as unknown;
  } catch {
    return `<untrusted_data source="${source}">${JSON.stringify(
      guarded.fields[0]?.text ?? ""
    )}</untrusted_data>`;
  }
  shaped = withholdInstructions(shaped);
  return `<untrusted_data source="${source}">${JSON.stringify(
    JSON.stringify(shaped)
  )}</untrusted_data>`;
}

export function sanitizeForUser(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/https?:\/\/\S+/gi, "[link removed]")
    .replace(
      /(^|\n)\s*(?:[$>]|powershell\b|cmd\b|sudo\b|rm\s|Remove-Item\b|netsh\b|reg\s|Set-)/gim,
      "$1[command removed]"
    )
    .trim();
}
