import { createHash } from "node:crypto";
import { getAiModel, getAiProviderKind } from "@/lib/ai/config";
import { getProviderTimeoutMs } from "@/lib/ai/safety-policy";
import { sanitizeForUser } from "./untrusted";

export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: unknown }
  | { role: "tool_result"; tool_use_id: string; content: string };

export type AgentToolSpec = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type AgentModelOutput =
  | {
      kind: "tool_use";
      id: string;
      name: string;
      input: unknown;
      summary: string;
    }
  | { kind: "final"; text: string; confidence: number; summary: string }
  | { kind: "invalid"; raw: string };

export interface AgentModel {
  next(input: {
    system: string;
    messages: AgentMessage[];
    tools: AgentToolSpec[];
    maxTokens: number;
    signal: AbortSignal;
  }): Promise<AgentModelOutput>;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function modelTelemetry(
  system: string,
  messages: AgentMessage[],
  completion: unknown
) {
  console.info("requester_agent_model_telemetry", {
    promptHash: digest({ system, messages }),
    promptLength: JSON.stringify({ system, messages }).length,
    completionHash: digest(completion),
    completionLength: JSON.stringify(completion).length,
  });
}

export class MockAgentModel implements AgentModel {
  private called = false;
  private diagnosticCalled = false;
  constructor(private readonly firstMessage: string) {}

  async next(): Promise<AgentModelOutput> {
    if (!this.called) {
      this.called = true;
      if (/wi[\s-]?fi|wireless|network/i.test(this.firstMessage)) {
        return {
          kind: "tool_use",
          id: `mock-${digest(this.firstMessage).slice(0, 12)}`,
          name: "search_guides",
          input: { query: this.firstMessage },
          summary: "I’m checking approved support guides.",
        };
      }
      return {
        kind: "tool_use",
        id: "mock-search",
        name: "search_guides",
        input: { query: this.firstMessage },
        summary: "I’m checking approved support guides.",
      };
    }
    if (
      !this.diagnosticCalled &&
      /wi[\s-]?fi|wireless|network/i.test(this.firstMessage)
    ) {
      this.diagnosticCalled = true;
      return {
        kind: "tool_use",
        id: "mock-diagnostics",
        name: "get_device_diagnostics",
        input: {},
        summary: "I’m checking stored device diagnostics.",
      };
    }
    return {
      kind: "final",
      text: "I found some information that may help. Please tell me whether it resolves the problem.",
      confidence: 0.9,
      summary: "I’m summarizing the available read-only findings.",
    };
  }
}

export class AnthropicAgentModel implements AgentModel {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async next(input: {
    system: string;
    messages: AgentMessage[];
    tools: AgentToolSpec[];
    maxTokens: number;
    signal: AbortSignal;
  }): Promise<AgentModelOutput> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.any([
        input.signal,
        AbortSignal.timeout(getProviderTimeoutMs()),
      ]),
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: input.maxTokens,
        system: input.system,
        tools: input.tools,
        tool_choice: { type: "auto" },
        messages: input.messages,
      }),
    });
    if (!response.ok) throw new Error("Anthropic agent request failed");
    const body = (await response.json()) as {
      content?: Array<{
        type: string;
        id?: string;
        name?: string;
        input?: unknown;
        text?: string;
      }>;
    };
    modelTelemetry(input.system, input.messages, body);
    const tool = body.content?.find((item) => item.type === "tool_use");
    if (tool?.name && tool.id) {
      return {
        kind: "tool_use",
        id: tool.id,
        name: tool.name,
        input: tool.input ?? {},
        summary: "I’m checking a read-only support source.",
      };
    }
    const text = sanitizeForUser(
      body.content?.find((item) => item.type === "text")?.text ?? ""
    ).slice(0, 1200);
    if (!text)
      return { kind: "invalid", raw: JSON.stringify(body).slice(0, 500) };
    return {
      kind: "final",
      text,
      confidence: 0.8,
      summary: "I’m summarizing the findings.",
    };
  }
}

export function createAgentModel(firstMessage: string): AgentModel {
  const provider = getAiProviderKind();
  if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY)
    return new AnthropicAgentModel(process.env.ANTHROPIC_API_KEY, getAiModel());
  return new MockAgentModel(firstMessage);
}
