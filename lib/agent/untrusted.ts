import { guardModelInput } from "@/lib/autonomy/guardrails/input";

export function wrapUntrusted(source: string, value: unknown): string {
  const raw = JSON.stringify(value);
  const guarded = guardModelInput([{ source: "event", text: raw }]);
  if (guarded.blocked) throw new Error("injection_in_tool_output");
  return `<untrusted_data source="${source}">${JSON.stringify(
    guarded.fields[0]?.text ?? ""
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
