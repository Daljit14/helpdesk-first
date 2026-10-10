import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  checkAndConsumeDailyBudget: vi.fn(async () => true),
  checkRateLimit: vi.fn(
    async (): Promise<{ allowed: boolean; retryAfter?: number }> => ({
      allowed: true,
    })
  ),
  createRateLimiter: vi.fn(() => ({
    check: vi.fn(async () => ({ allowed: true })),
  })),
  checkUserMessageSafety: vi.fn((): { allowed: boolean; reason?: string } => ({
    allowed: true,
  })),
  isAiEnabled: vi.fn((): { enabled: boolean } => ({ enabled: true })),
  recordProviderCall: vi.fn(),
}));

vi.mock("@/lib/ai/budget", () => ({
  checkAndConsumeDailyBudget: mocks.checkAndConsumeDailyBudget,
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  createRateLimiter: mocks.createRateLimiter,
}));
vi.mock("@/lib/ai/safety-policy", () => ({
  checkUserMessageSafety: mocks.checkUserMessageSafety,
  isAiEnabled: mocks.isAiEnabled,
}));
vi.mock("@/lib/ai/telemetry", () => ({
  recordProviderCall: mocks.recordProviderCall,
}));
const validBody = {
  turns: [{ role: "user", text: "My laptop is running slowly." }],
  platform: "Windows",
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function providerResponse(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({
      content: [{ type: "text", text }],
      usage: { input_tokens: 19, output_tokens: 8 },
    }),
    { status }
  );
}

beforeEach(() => {
  vi.stubEnv("HELP_DESK_ASSISTANT_CHAT_ENABLED", "true");
  vi.stubEnv("HELP_DESK_AI_ENABLED", "true");
  vi.stubEnv("HELP_DESK_AI_PROVIDER", "anthropic");
  vi.stubEnv("HELP_DESK_AI_MODEL", "claude-test");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-api-key");
  mocks.checkAndConsumeDailyBudget.mockResolvedValue(true);
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.checkUserMessageSafety.mockReturnValue({ allowed: true });
  mocks.isAiEnabled.mockReturnValue({ enabled: true });
  mocks.recordProviderCall.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("POST /api/assistant/chat", () => {
  test("returns 404 while the conversational chat flag is off", async () => {
    vi.stubEnv("HELP_DESK_ASSISTANT_CHAT_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(validBody));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns 503 when AI is disabled, provider is not Anthropic, or key is missing", async () => {
    mocks.isAiEnabled.mockReturnValue({ enabled: false });
    expect((await POST(request(validBody))).status).toBe(503);

    mocks.isAiEnabled.mockReturnValue({ enabled: true });
    vi.stubEnv("HELP_DESK_AI_PROVIDER", "mock");
    expect((await POST(request(validBody))).status).toBe(503);

    vi.stubEnv("HELP_DESK_AI_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await POST(request(validBody))).status).toBe(503);
  });

  test("strictly validates turns, platform, and a final user turn", async () => {
    const malformed = await POST(request({ ...validBody, unexpected: true }));
    const badTurn = await POST(
      request({
        turns: [{ role: "assistant", text: "hello" }],
        platform: null,
      })
    );
    const tooManyTurns = await POST(
      request({
        turns: Array.from({ length: 21 }, () => ({
          role: "user",
          text: "hello",
        })),
        platform: null,
      })
    );

    expect(malformed.status).toBe(400);
    expect(badTurn.status).toBe(400);
    expect(tooManyTurns.status).toBe(400);
    expect(await malformed.json()).toEqual({ status: "invalid_request" });
  });

  test("re-screens sensitive user turns and never calls Anthropic", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      request({
        turns: [{ role: "user", text: "my password is Hunter2!" }],
        platform: null,
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(mocks.checkUserMessageSafety).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("does not call Anthropic when the shared message safety check blocks", async () => {
    mocks.checkUserMessageSafety.mockReturnValue({
      allowed: false,
      reason: "blocked",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(mocks.checkUserMessageSafety).toHaveBeenCalledWith({
      message: "My laptop is running slowly.",
      previousAnswers: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("includes prior user turns in the shared safety re-screen", async () => {
    const fetchMock = vi.fn(async () =>
      providerResponse("Try restarting the app.")
    );
    vi.stubGlobal("fetch", fetchMock);
    const body = {
      turns: [
        { role: "user", text: "My laptop is slow." },
        { role: "assistant", text: "When did this begin?" },
        { role: "user", text: "After I installed an update." },
      ],
      platform: " Windows ",
    };

    const response = await POST(request(body));

    expect(mocks.checkUserMessageSafety).toHaveBeenCalledWith({
      message: "After I installed an update.",
      previousAnswers: [{ questionId: "chat", answer: "My laptop is slow." }],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      reply: "Try restarting the app.",
    });
  });

  test("returns unavailable when the shared daily budget is exhausted", async () => {
    mocks.checkAndConsumeDailyBudget.mockResolvedValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns a rate-limit response with Retry-After", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      retryAfter: 37,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(validBody));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect(await response.json()).toEqual({ status: "rate_limited" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns screened model text and records provider usage", async () => {
    const fetchMock = vi.fn(async () =>
      providerResponse(
        "Restart the app. Run PowerShell to disable security settings."
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      reply: "Restart the app.",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
    expect(mocks.recordProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        model: "claude-test",
        outcome: "ok",
        inputTokens: 19,
        outputTokens: 8,
      })
    );
  });

  test("returns unavailable when all model text is unsafe", async () => {
    const fetchMock = vi.fn(async () =>
      providerResponse("Turn off the firewall and retry.")
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(mocks.recordProviderCall).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "unsafe" })
    );
  });
});
