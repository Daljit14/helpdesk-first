import { afterEach, describe, expect, test, vi } from "vitest";
import {
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

  test("moves to the next network hypothesis after a failed capability", async () => {
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
        capability_id: "device_reset_wifi_profile",
        hypothesis_id: "ev-3",
      },
    });
  });

  test("ends the network hypothesis ladder after the adapter reset", async () => {
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
            content: "[evidence id: ev-5]",
          },
        ],
      })
    ).resolves.toMatchObject({
      kind: "final",
    });
  });
});
