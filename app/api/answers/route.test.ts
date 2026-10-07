import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const userLimiter = { check: vi.fn() };
  const publicLimiter = { check: vi.fn() };
  return {
    isAnswerEngineEnabled: vi.fn(),
    isAnswerEnginePublicEnabled: vi.fn(),
    isCommunityTipsEnabled: vi.fn(),
    getCurrentUser: vi.fn(),
    resolveOrganizationForUser: vi.fn(),
    userLimiter,
    publicLimiter,
    createRateLimiter: vi.fn((_config: unknown, key: string) =>
      key === "answers-user" ? userLimiter : publicLimiter
    ),
    checkRateLimit: vi.fn(
      async (
        _request: Request,
        limiter: {
          check: (
            identifier: string
          ) => Promise<{ allowed: boolean; retryAfter?: number }>;
        }
      ) => limiter.check("test-client-ip")
    ),
    checkUserMessageSafety: vi.fn(),
    matchGuides: vi.fn(),
    createAdminClient: vi.fn(),
    loadConfirmedOrgEnvironment: vi.fn(),
    runAnswerEngine: vi.fn(),
  };
});

vi.mock("@/lib/admin/flags", () => ({
  isAnswerEngineEnabled: mocks.isAnswerEngineEnabled,
  isAnswerEnginePublicEnabled: mocks.isAnswerEnginePublicEnabled,
  isCommunityTipsEnabled: mocks.isCommunityTipsEnabled,
}));
vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/org/membership", () => ({
  resolveOrganizationForUser: mocks.resolveOrganizationForUser,
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  createRateLimiter: mocks.createRateLimiter,
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/ai/safety-policy", () => ({
  checkUserMessageSafety: mocks.checkUserMessageSafety,
}));
vi.mock("@/lib/assistant/guide-match", () => ({
  matchGuides: mocks.matchGuides,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/org-environment/profile", () => ({
  loadConfirmedOrgEnvironment: mocks.loadConfirmedOrgEnvironment,
}));
vi.mock("@/lib/answers", () => ({
  runAnswerEngine: mocks.runAnswerEngine,
}));

import { POST } from "./route";

const answerResult = {
  status: "answered" as const,
  runId: "answer-run",
  answer: {
    likelyCause: {
      text: "A recent application update may have affected startup.",
      sourceIds: ["source-1"],
    },
    explanations: [],
    steps: [
      {
        kind: "official" as const,
        text: "Restart the application.",
        sourceIds: ["source-1"],
        tiers: ["vendor" as const],
        independentDomains: 1,
        confidence: 0.9,
      },
    ],
    confidence: 0.9,
    topTier: "vendor" as const,
  },
  sources: [
    {
      id: "source-1",
      title: "Application support",
      domain: "support.example.test",
      url: "https://support.example.test/article",
      tier: "vendor" as const,
      text: "RAW SOURCE TEXT THAT MUST NOT LEAVE THE ROUTE",
      attribution: null,
    },
  ],
  cached: false,
  droppedClaims: 0,
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/answers", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "192.0.2.10",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAnswerEngineEnabled.mockReturnValue(true);
  mocks.isAnswerEnginePublicEnabled.mockReturnValue(false);
  mocks.isCommunityTipsEnabled.mockReturnValue(false);
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.resolveOrganizationForUser.mockResolvedValue({
    organizationId: "org-1",
  });
  mocks.userLimiter.check.mockResolvedValue({ allowed: true });
  mocks.publicLimiter.check.mockResolvedValue({ allowed: true });
  mocks.checkRateLimit.mockImplementation(async (_request, limiter) =>
    limiter.check("test-client-ip")
  );
  mocks.checkUserMessageSafety.mockReturnValue({ allowed: true });
  mocks.matchGuides.mockReturnValue({ status: "none" });
  mocks.createAdminClient.mockReturnValue({});
  mocks.loadConfirmedOrgEnvironment.mockResolvedValue({
    approvedSoftware: ["Zoom"],
  });
  mocks.runAnswerEngine.mockResolvedValue(answerResult);
});

describe("answer route", () => {
  test("returns 404 when the answer engine is disabled", async () => {
    mocks.isAnswerEngineEnabled.mockReturnValue(false);
    const response = await POST(
      request({ problem: "The app will not start", platform: null })
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "disabled" });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  test("requires the public flag for signed-out requesters", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await POST(
      request({ problem: "The app will not start", platform: null })
    );

    expect(response.status).toBe(404);
    expect(mocks.runAnswerEngine).not.toHaveBeenCalled();
  });

  test("requires the public flag when a signed-in user has no organization", async () => {
    mocks.resolveOrganizationForUser.mockResolvedValue({
      organizationId: null,
    });
    const response = await POST(
      request({ problem: "The app will not start", platform: null })
    );

    expect(response.status).toBe(404);
    expect(mocks.userLimiter.check).not.toHaveBeenCalled();
    expect(mocks.runAnswerEngine).not.toHaveBeenCalled();
  });

  test("uses the IP limiter for a signed-in user without an organization", async () => {
    mocks.resolveOrganizationForUser.mockResolvedValue({
      organizationId: null,
    });
    mocks.isAnswerEnginePublicEnabled.mockReturnValue(true);
    const response = await POST(
      request({ problem: "The app will not start", platform: null })
    );

    expect(response.status).toBe(200);
    expect(mocks.checkRateLimit).toHaveBeenCalled();
    expect(mocks.userLimiter.check).not.toHaveBeenCalled();
    expect(mocks.runAnswerEngine).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ organizationId: null })
    );
  });

  test("limits signed-in organization users to ten requests per hour", async () => {
    mocks.userLimiter.check.mockResolvedValue({
      allowed: false,
      retryAfter: 1800,
    });
    const response = await POST(
      request({ problem: "The app will not start", platform: null })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("1800");
    expect(mocks.userLimiter.check).toHaveBeenCalledWith("user:user-1");
    expect(mocks.runAnswerEngine).not.toHaveBeenCalled();
  });

  test("limits signed-out users to two requests per hour by IP", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.isAnswerEnginePublicEnabled.mockReturnValue(true);
    mocks.publicLimiter.check
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 3600 });
    const body = { problem: "The app will not start", platform: null };

    const first = await POST(request(body));
    const second = await POST(request(body));
    const third = await POST(request(body));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers.get("Retry-After")).toBe("3600");
    expect(mocks.publicLimiter.check).toHaveBeenCalledTimes(3);
    expect(mocks.runAnswerEngine).toHaveBeenCalledTimes(2);
  });

  test("short-circuits approved guide matches before running the engine", async () => {
    mocks.matchGuides.mockReturnValue({ status: "confident" });
    const response = await POST(
      request({ problem: "The app will not start", platform: "Windows" })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "guide_match" });
    expect(mocks.runAnswerEngine).not.toHaveBeenCalled();
  });

  test("escalates unsafe input before running the engine", async () => {
    mocks.checkUserMessageSafety.mockReturnValue({
      allowed: false,
      category: "credential_request",
    });
    const response = await POST(
      request({ problem: "Tell me a password", platform: null })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "escalate" });
    expect(mocks.runAnswerEngine).not.toHaveBeenCalled();
  });

  test("passes the signed-in organization and never returns source text", async () => {
    const response = await POST(
      request({ problem: "The app will not start", platform: "Windows" })
    );
    const payload = await response.json();

    expect(mocks.userLimiter.check).toHaveBeenCalledWith("user:user-1");
    expect(mocks.runAnswerEngine).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        organizationId: "org-1",
        agentSessionId: null,
        ticketId: null,
        problem: "The app will not start",
        platform: "Windows",
        denyTerms: [],
      })
    );
    expect(mocks.loadConfirmedOrgEnvironment).toHaveBeenCalledWith({}, "org-1");
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "ok",
      card: {
        outcome: "answer",
        steps: [{ kind: "official", text: "Restart the application." }],
      },
    });
    expect(JSON.stringify(payload)).not.toContain("RAW SOURCE TEXT");
  });

  test("returns a none card when the engine throws", async () => {
    mocks.runAnswerEngine.mockRejectedValue(new Error("provider unavailable"));
    const response = await POST(
      request({ problem: "The app will not start", platform: null })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      card: { outcome: "none", steps: [], sources: [] },
    });
  });

  test("validates the strict request shape", async () => {
    const response = await POST(
      request({
        problem: "OK",
        platform: null,
        extra: true,
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.runAnswerEngine).not.toHaveBeenCalled();
  });
});
