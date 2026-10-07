import { detectInstructionContent } from "@/lib/agent/tripwires";
import { INSTRUCTION_WITHHELD } from "@/lib/agent/untrusted";

const TOOL_CALL_JSON =
  /(?:^|\s)\{\s*"(?:tool|name)"\s*:\s*"[^"]{1,120}"\s*,\s*"(?:input|arguments)"\s*:/i;

export function screenSourceText(text: string): {
  text: string;
  withheld: number;
} {
  let withheld = 0;
  const paragraphs = text.split(/\n\s*\n/).map((paragraph) => {
    if (!detectInstructionContent(paragraph) && !TOOL_CALL_JSON.test(paragraph))
      return paragraph;
    withheld += 1;
    return INSTRUCTION_WITHHELD;
  });
  return { text: paragraphs.join("\n\n"), withheld };
}
