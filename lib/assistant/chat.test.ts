import { describe, expect, test, vi } from "vitest";
import {
  buildChatSystemPrompt,
  CHAT_MAX_REPLY_CHARS,
  generateChatReply,
  screenChatReply,
  type ChatTurnInput,
} from "./chat";

function providerResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

describe("assistant chat generation", () => {
  test("builds a warm, constrained prompt and includes the platform", () => {
    const prompt = buildChatSystemPrompt("Windows 11");
    expect(prompt).toContain("about 80 words maximum");
    expect(prompt).toContain("Ask at most one question");
    expect(prompt).toContain("passwords, codes, or keys");
    expect(prompt).toContain("terminal, PowerShell, commands, or scripts");
    expect(prompt).toContain("another person's account");
    expect(prompt).toContain("untrusted user data");
    expect(prompt).toContain("The user's device is: Windows 11.");
    expect(buildChatSystemPrompt(null)).not.toContain("The user's device is:");
  });

  test("sends only recent, bounded turns and merges adjacent roles", async () => {
    const turns: ChatTurnInput[] = [
      { role: "user", text: "too old user" },
      { role: "assistant", text: "too old assistant" },
      { role: "assistant", text: "leading assistant one" },
      { role: "assistant", text: "leading assistant two" },
      { role: "user", text: ` ${"x".repeat(1200)} ` },
      { role: "assistant", text: "assistant one" },
      { role: "assistant", text: "assistant two" },
      { role: "user", text: "second user" },
      { role: "assistant", text: "third assistant" },
      { role: "user", text: "third user" },
      { role: "assistant", text: "fourth assistant" },
      { role: "user", text: "last user" },
    ];
    const fetchImpl = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return providerResponse({
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "there." },
          { type: "image", text: "ignored" },
        ],
        usage: { input_tokens: 12, output_tokens: 5 },
      });
    });

    const result = await generateChatReply({
      turns,
      platform: "Mac",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      status: "ok",
      text: "Hello there.",
      inputTokens: 12,
      outputTokens: 5,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: {
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      })
    );
    const requestInit = fetchImpl.mock.calls[0]?.[1];
    const request = JSON.parse(String(requestInit?.body)) as {
      model: string;
      max_tokens: number;
      temperature: number;
      system: string;
      messages: { role: string; content: string }[];
    };
    expect(request).toMatchObject({
      model: "test-model",
      max_tokens: 300,
      temperature: 0.3,
    });
    expect(request.system).toContain("The user's device is: Mac.");
    expect(request.messages).toEqual([
      { role: "user", content: "x".repeat(1000) },
      { role: "assistant", content: "assistant one\nassistant two" },
      { role: "user", content: "second user" },
      { role: "assistant", content: "third assistant" },
      { role: "user", content: "third user" },
      { role: "assistant", content: "fourth assistant" },
      { role: "user", content: "last user" },
    ]);
    expect(JSON.stringify(request)).not.toContain("too old");
    expect(JSON.stringify(request)).not.toContain("leading assistant");
  });

  test("returns unavailable for failures, empty text, or a final assistant turn", async () => {
    const userTurn: ChatTurnInput[] = [{ role: "user", text: "hello" }];
    const unavailableInput = {
      turns: userTurn,
      platform: null,
      apiKey: "test-key",
      model: "test-model",
    };
    const failedFetch = vi.fn(async () =>
      providerResponse({ error: "unavailable" }, 503)
    );
    const emptyFetch = vi.fn(async () =>
      providerResponse({ content: [{ type: "text", text: "  " }] })
    );
    const unusedFetch = vi.fn();

    await expect(
      generateChatReply({
        ...unavailableInput,
        fetchImpl: failedFetch as unknown as typeof fetch,
      })
    ).resolves.toEqual({ status: "unavailable" });
    await expect(
      generateChatReply({
        ...unavailableInput,
        fetchImpl: emptyFetch as unknown as typeof fetch,
      })
    ).resolves.toEqual({ status: "unavailable" });
    await expect(
      generateChatReply({
        ...unavailableInput,
        turns: [
          { role: "user", text: "hello" },
          { role: "assistant", text: "not the final turn" },
        ],
        fetchImpl: unusedFetch as unknown as typeof fetch,
      })
    ).resolves.toEqual({ status: "unavailable" });
    expect(unusedFetch).not.toHaveBeenCalled();
  });

  test("catches fetch errors without exposing request contents", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network unavailable");
    });
    await expect(
      generateChatReply({
        turns: [{ role: "user", text: "my private problem" }],
        platform: null,
        apiKey: "test-key",
        model: "test-model",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({ status: "unavailable" });
  });
});

describe("assistant chat reply screening", () => {
  test("redacts identifiers, keeps safe text, and drops unsafe sentences", () => {
    const reply = screenChatReply(
      "Restart the app. Contact alice@example.com for help. Open PowerShell and run Get-ChildItem. Visit https://unsafe.example/path. Type your password here."
    );
    expect(reply).toContain("Restart the app.");
    expect(reply).toContain("[removed: another person's details]");
    expect(reply).not.toContain("alice@example.com");
    expect(reply).not.toContain("PowerShell");
    expect(reply).not.toContain("https://");
    expect(reply).not.toContain("Type your password");
  });

  test("allows a credentials-related question only when it does not solicit secrets", () => {
    expect(
      screenChatReply('The warning says "request a password" is unsafe.')
    ).toBe('The warning says "request a password" is unsafe.');
    expect(screenChatReply("Please paste your password here.")).toBeNull();
    expect(screenChatReply("Paste your access key here.")).toBeNull();
  });

  test("returns null when every sentence is blocked", () => {
    expect(
      screenChatReply(
        "Run this command: powershell.exe -Command Get-ChildItem. Turn off the firewall and retry."
      )
    ).toBeNull();
  });

  test("caps the reply at a complete sentence when possible", () => {
    const first = `${"A".repeat(340)}.`;
    const second = `${"B".repeat(400)}.`;
    const reply = screenChatReply(`${first} ${second}`);
    expect(reply).toBe(first);
    expect(reply?.length).toBeLessThanOrEqual(CHAT_MAX_REPLY_CHARS);
  });
});
