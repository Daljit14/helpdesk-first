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
    const result = await model.next();
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
    await expect(model.next()).resolves.toMatchObject({
      input: { query: "screenshot problem" },
    });

    const longPrefix = "x".repeat(250);
    const boundedModel = new MockAgentModel(`${longPrefix}<untrusted_data`);
    await expect(boundedModel.next()).resolves.toMatchObject({
      input: { query: "x".repeat(200) },
    });
  });
});
