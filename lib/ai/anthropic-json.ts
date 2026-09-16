import { checkAndConsumeDailyBudget } from "./budget";
import { getAiModel, getAiProviderKind } from "./config";
import { getProviderTimeoutMs } from "./safety-policy";
import type { JsonGenerator } from "@/lib/autonomy/planner/model-planner";

export function createAnthropicJsonGenerator(): JsonGenerator | null {
  if (getAiProviderKind() !== "anthropic" || !process.env.ANTHROPIC_API_KEY)
    return null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return async (prompt, signal) => {
    if (!(await checkAndConsumeDailyBudget()))
      throw new Error("AI daily budget exhausted");
    const timeout = AbortSignal.any([
      signal,
      AbortSignal.timeout(getProviderTimeoutMs()),
    ]);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: timeout,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "tools-2024-04-04",
      },
      body: JSON.stringify({
        model: getAiModel(),
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
        tools: [
          {
            name: "emit_plan",
            description: "Emit the planner JSON object.",
            input_schema: {
              type: "object",
              additionalProperties: true,
            },
          },
        ],
        tool_choice: { type: "tool", name: "emit_plan" },
      }),
    });
    if (!response.ok) throw new Error("Anthropic planner request failed");
    const body = (await response.json()) as {
      content?: { type: string; input?: unknown }[];
    };
    const tool = body.content?.find((item) => item.type === "tool_use");
    if (!tool || tool.input === undefined)
      throw new Error("Anthropic planner returned no plan");
    return JSON.stringify(tool.input);
  };
}
