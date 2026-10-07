import { afterEach, describe, expect, test, vi } from "vitest";
import {
  AnthropicAgentModel,
  AnthropicScreenshotTranscriber,
  MockAgentModel,
  MockScreenshotTranscriber,
} from "./model";

afterEach(() => vi.unstubAllGlobals());

describe("screenshot transcribers", () => {
  test("sends an Anthropic image content block without tools", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Visible error" }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    await new AnthropicScreenshotTranscriber(
      "key",
      "configured-model"
    ).transcribe({
      bytes: new Uint8Array([1, 2, 3]),
      mime: "image/png",
      signal: new AbortController().signal,
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.model).toBe("configured-model");
    expect(request.max_tokens).toBe(1024);
    expect(request.tools).toBeUndefined();
    expect(request.messages[0].content).toEqual([
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: Buffer.from([1, 2, 3]).toString("base64"),
        },
      },
      { type: "text", text: "Transcribe." },
    ]);
  });

  test("mock transcription honors the environment override", async () => {
    vi.stubEnv("HELP_DESK_MOCK_SCREENSHOT_TEXT", "custom screenshot text");
    await expect(new MockScreenshotTranscriber().transcribe()).resolves.toEqual(
      {
        text: "custom screenshot text",
      }
    );
  });

  test("keeps screenshot transcription out of the mock search query", async () => {
    const model = new MockAgentModel(
      'I shared a screenshot of the problem.\n\n<untrusted_data source="screenshot">Wi-Fi is not connected.</untrusted_data>'
    );
    const result = await model.next({ messages: [] });
    expect(result).toMatchObject({
      kind: "tool_use",
      name: "search_guides",
      input: { query: "I shared a screenshot of the problem." },
    });
  });

  test("uses a bounded fallback query when the message starts with screenshot data", async () => {
    const model = new MockAgentModel(
      '<untrusted_data source="screenshot">Only screenshot text.</untrusted_data>'
    );
    await expect(model.next({ messages: [] })).resolves.toMatchObject({
      input: { query: "screenshot problem" },
    });

    const longPrefix = "x".repeat(250);
    const boundedModel = new MockAgentModel(`${longPrefix}<untrusted_data`);
    await expect(boundedModel.next({ messages: [] })).resolves.toMatchObject({
      input: { query: "x".repeat(200) },
    });
  });

  test("uses the diagnostics evidence id from the conversation", async () => {
    vi.stubEnv("HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED", "true");
    const model = new MockAgentModel("Wi-Fi is down");
    await model.next({ messages: [] });
    await model.next({ messages: [] });
    const result = await model.next({
      messages: [
        {
          role: "tool_result",
          tool_use_id: "mock-diagnostics",
          content: "Diagnostics found a network issue.\n[evidence id: ev-3]",
        },
      ],
    });

    expect(result).toMatchObject({
      kind: "tool_use",
      name: "propose_action",
      input: { hypothesis_id: "ev-3" },
    });
  });

  test("moves to the adapter reset after a failed DNS flush", async () => {
    vi.stubEnv("HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED", "true");
    const model = new MockAgentModel("Still broken after `device_flush_dns`");
    await expect(model.next({ messages: [] })).resolves.toMatchObject({
      kind: "tool_use",
      name: "search_guides",
    });
    await expect(model.next({ messages: [] })).resolves.toMatchObject({
      kind: "tool_use",
      name: "get_device_diagnostics",
    });
    await expect(
      model.next({
        messages: [
          {
            role: "tool_result",
            tool_use_id: "mock-diagnostics",
            content: "[evidence id: ev-3]",
          },
        ],
      })
    ).resolves.toMatchObject({
      kind: "tool_use",
      name: "propose_action",
      input: {
        capability_id: "device_reset_network_adapter",
        hypothesis_id: "ev-3",
      },
    });
  });

  test("uses the diagnostic SSID for the Wi-Fi profile hypothesis", async () => {
    vi.stubEnv("HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED", "true");
    const model = new MockAgentModel(
      "Still broken after `device_reset_network_adapter`"
    );
    await model.next({ messages: [] });
    await model.next({ messages: [] });
    await expect(
      model.next({
        messages: [
          {
            role: "tool_result",
            tool_use_id: "mock-diagnostics",
            content:
              '{"wifi_status":{"connected":false,"ssid":"Office-WiFi"}}\n[evidence id: ev-5]',
          },
        ],
      })
    ).resolves.toMatchObject({
      kind: "tool_use",
      name: "propose_action",
      input: {
        capability_id: "device_reset_wifi_profile",
        params: { ssid: "Office-WiFi" },
        hypothesis_id: "ev-5",
      },
    });
  });

  test("ends the network hypothesis ladder after the Wi-Fi profile reset", async () => {
    vi.stubEnv("HELP_DESK_REQUESTER_AGENT_ACTIONS_ENABLED", "true");
    const model = new MockAgentModel(
      "Still broken after `device_reset_wifi_profile`"
    );
    await model.next({ messages: [] });
    await model.next({ messages: [] });
    await expect(
      model.next({
        messages: [
          {
            role: "tool_result",
            tool_use_id: "mock-diagnostics",
            content: "[evidence id: ev-6]",
          },
        ],
      })
    ).resolves.toMatchObject({
      kind: "final",
    });
  });
});

describe("Anthropic requester-agent model", () => {
  test("parses a final_reply tool call into a structured final output", async () => {
    const reply = {
      summary: "The sign-in service is available.",
      checked: ["I checked the service status."],
      nextStep: {
        action: "Try signing in again.",
        why: "The service is available.",
      },
      sourceIds: ["source-1"],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [
              {
                type: "tool_use",
                id: "reply-1",
                name: "final_reply",
                input: reply,
              },
            ],
          }),
          { status: 200 }
        )
      )
    );

    await expect(
      new AnthropicAgentModel("key", "claude-haiku-4-5").next({
        system: "system prompt",
        messages: [{ role: "user", content: "Help." }],
        tools: [],
        maxTokens: 1200,
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({
      kind: "final",
      text: "The sign-in service is available. Try signing in again.",
      reply,
      confidence: 0.8,
      summary: "I’m summarizing the findings.",
    });
  });

  test("returns invalid when final_reply input fails schema validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            content: [
              {
                type: "tool_use",
                id: "reply-1",
                name: "final_reply",
                input: { summary: "", checked: [], sourceIds: [] },
              },
            ],
          }),
          { status: 200 }
        )
      )
    );

    await expect(
      new AnthropicAgentModel("key", "claude-haiku-4-5").next({
        system: "system prompt",
        messages: [{ role: "user", content: "Help." }],
        tools: [],
        maxTokens: 1200,
        signal: new AbortController().signal,
      })
    ).resolves.toMatchObject({ kind: "invalid" });
  });

  test("keeps the request body unchanged when prompt caching is off", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Try reconnecting." }],
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      system: "system prompt",
      messages: [{ role: "user" as const, content: "Wi-Fi is down." }],
      tools: [],
      maxTokens: 1200,
      signal: new AbortController().signal,
    };

    await new AnthropicAgentModel("key", "claude-haiku-4-5").next(input);

    expect(fetchMock.mock.calls[0][1].body).toBe(
      JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1200,
        system: "system prompt",
        tools: [],
        tool_choice: { type: "auto" },
        messages: input.messages,
      })
    );
  });

  test("adds the top-level ephemeral cache control when enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "Try reconnecting." }],
          usage: {},
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    await new AnthropicAgentModel("key", "claude-sonnet-5", {
      promptCache: true,
    }).next({
      system: "system prompt",
      messages: [{ role: "user", content: "Wi-Fi is down." }],
      tools: [],
      maxTokens: 1200,
      signal: new AbortController().signal,
    });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.cache_control).toEqual({ type: "ephemeral" });
  });

  test("parses non-negative token usage, including prompt-cache token counts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              id: "tool-1",
              name: "search_guides",
              input: { query: "Wi-Fi" },
            },
          ],
          usage: {
            input_tokens: -1,
            output_tokens: 12.5,
            cache_creation_input_tokens: 40,
            cache_read_input_tokens: 25,
          },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new AnthropicAgentModel(
      "key",
      "claude-haiku-4-5-20251001"
    ).next({
      system: "system prompt",
      messages: [{ role: "user", content: "Wi-Fi is down." }],
      tools: [],
      maxTokens: 1200,
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      kind: "tool_use",
      model: "claude-haiku-4-5-20251001",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationInputTokens: 40,
        cacheReadInputTokens: 25,
      },
    });
  });

  test.each([
    {
      content: [{ type: "text", text: "Helpful response." }],
      kind: "final",
    },
    { content: [], kind: "invalid" },
  ])("sets the model id on $kind outputs", async ({ content, kind }) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ content }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new AnthropicAgentModel("key", "claude-opus-5").next({
      system: "system prompt",
      messages: [{ role: "user", content: "Help." }],
      tools: [],
      maxTokens: 1200,
      signal: new AbortController().signal,
    });

    expect(result.kind).toBe(kind);
    expect(result.model).toBe("claude-opus-5");
    expect(result.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    });
  });
});
