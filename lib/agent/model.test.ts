import { afterEach, describe, expect, test, vi } from "vitest";
import {
  AnthropicScreenshotTranscriber,
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
});
