import type { createAdminClient } from "@/lib/supabase/admin";
import { containsExecutableContent } from "@/lib/autonomy/guardrails/planner-output";
import { guardModelInput } from "@/lib/autonomy/guardrails/input";
import { trustTierFor } from "./allowlist";
import type { ResearchSource } from "./types";

type GuardContext = {
  admin: ReturnType<typeof createAdminClient>;
  run: { id: string; organization_id: string; ticket_id: string };
};

export async function guardSource(
  source: ResearchSource,
  context?: GuardContext
): Promise<
  | { ok: true; source: ResearchSource }
  | { ok: false; reason: "prompt_injection" | "executable_content" | "empty" }
> {
  if (!source.snippet.trim() || !trustTierFor(source.url))
    return { ok: false, reason: "empty" };
  const guarded = guardModelInput([
    { source: "knowledge", text: source.snippet },
  ]);
  if (
    guarded.findings.some((finding) => finding.category === "prompt-injection")
  ) {
    if (context) {
      const { writeGuardrailEvent } =
        await import("@/lib/autonomy/guardrails/events");
      await writeGuardrailEvent(context.admin, {
        run: context.run,
        kind: "guardrail.prompt_injection_detected",
        reasonCode: "prompt-injection",
        actor: "research",
        detail: { domain: source.domain },
      });
    }
    return { ok: false, reason: "prompt_injection" };
  }
  if (containsExecutableContent(source.snippet))
    return { ok: false, reason: "executable_content" };
  return {
    ok: true,
    source: { ...source, snippet: guarded.fields[0]?.text ?? "" },
  };
}
