import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveOrganizationForUser: vi.fn(),
  isRequesterAgentEnabled: vi.fn(),
  isRequesterAgentEnabledForOrg: vi.fn(),
  isRequesterAgentVisionEnabledForOrg: vi.fn(),
  isAgentUserStepsEnabled: vi.fn(),
  isIdentityAssuranceEnabled: vi.fn(),
  checkRateLimit: vi.fn(),
  createRateLimiter: vi.fn(() => ({})),
  createAdminClient: vi.fn(),
  createSession: vi.fn(),
  loadActiveSession: vi.fn(),
  updateSession: vi.fn(),
  writeStep: vi.fn(),
  createClient: vi.fn(),
  handleAgentRequest: vi.fn(),
  escalate: vi.fn(),
}));

vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/org/membership", () => ({
  resolveOrganizationForUser: mocks.resolveOrganizationForUser,
}));
vi.mock("@/lib/admin/flags", () => ({
  getIdentityAssuranceFreshMinutes: vi.fn(() => 10),
  isIdentityAssuranceEnabled: mocks.isIdentityAssuranceEnabled,
  isRequesterAgentEnabled: mocks.isRequesterAgentEnabled,
  isRequesterAgentEnabledForOrg: mocks.isRequesterAgentEnabledForOrg,
  isRequesterAgentVisionEnabledForOrg:
    mocks.isRequesterAgentVisionEnabledForOrg,
  isAgentUserStepsEnabled: mocks.isAgentUserStepsEnabled,
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  createRateLimiter: mocks.createRateLimiter,
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/agent/session", () => ({
  createSession: mocks.createSession,
  loadActiveSession: mocks.loadActiveSession,
  updateSession: mocks.updateSession,
  writeStep: mocks.writeStep,
  escalate: mocks.escalate,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/agent/turn", () => ({
  handleAgentRequest: mocks.handleAgentRequest,
}));

import { POST } from "./route";

const session = {
  id: "00000000-0000-4000-8000-000000000001",
  organization_id: "org",
  requester_id: "user",
  status: "active",
  assurance_level: null as string | null,
  assurance_method: null as string | null,
  assurance_auth_at: null as string | null,
  assurance_expires_at: null as string | null,
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/ai/agent", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.assurance_level = null;
  session.assurance_method = null;
  session.assurance_auth_at = null;
  session.assurance_expires_at = null;
  mocks.getCurrentUser.mockResolvedValue({ id: "user" });
  mocks.resolveOrganizationForUser.mockResolvedValue({ organizationId: "org" });
  mocks.isRequesterAgentEnabled.mockReturnValue(true);
  mocks.isRequesterAgentEnabledForOrg.mockReturnValue(true);
  mocks.isRequesterAgentVisionEnabledForOrg.mockReturnValue(true);
  mocks.isAgentUserStepsEnabled.mockReturnValue(false);
  mocks.isIdentityAssuranceEnabled.mockReturnValue(false);
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.createSession.mockResolvedValue(session);
  mocks.loadActiveSession.mockResolvedValue(session);
  mocks.updateSession.mockResolvedValue(session);
  mocks.createClient.mockResolvedValue({
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: { sub: "user", amr: [{ method: "pwd" }] } },
      })),
    },
  });
  mocks.createAdminClient.mockReturnValue({});
  mocks.handleAgentRequest.mockResolvedValue(undefined);
  mocks.escalate.mockResolvedValue("ticket-id");
  mocks.writeStep.mockResolvedValue(undefined);
});

describe("requester agent route", () => {
  test("returns 401 without a user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await POST(request({ message: "hello" }))).status).toBe(401);
  });

  test.each([
    ["flag off", () => mocks.isRequesterAgentEnabled.mockReturnValue(false)],
    [
      "organization not allowlisted",
      () => mocks.isRequesterAgentEnabledForOrg.mockReturnValue(false),
    ],
  ])("returns 404 when %s", async (_name, setup) => {
    setup();
    expect((await POST(request({ message: "hello" }))).status).toBe(404);
  });

  test("returns 429 when rate limited", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false });
    expect((await POST(request({ message: "hello" }))).status).toBe(429);
  });

  test("returns 400 for malformed input", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request({ message: "" }))).status).toBe(400);
  });

  test("returns 404 for attachments when vision is disabled", async () => {
    mocks.isRequesterAgentVisionEnabledForOrg.mockReturnValue(false);
    const response = await POST(
      request({
        message: "Inspect this",
        attachmentIds: ["00000000-0000-4000-8000-000000000010"],
      })
    );
    expect(response.status).toBe(404);
    expect(mocks.handleAgentRequest).not.toHaveBeenCalled();
  });

  test("accepts user-step outcomes as non-empty requests when enabled", async () => {
    mocks.isAgentUserStepsEnabled.mockReturnValue(true);
    const response = await POST(
      request({
        sessionId: session.id,
        userStep: {
          stepId: "00000000-0000-4000-8000-000000000010",
          outcome: "done",
        },
      })
    );
    await response.text();
    expect(response.status).toBe(200);
    expect(mocks.handleAgentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "",
        userStep: {
          stepId: "00000000-0000-4000-8000-000000000010",
          outcome: "done",
        },
      })
    );
  });

  test("returns 404 for user-step outcomes when disabled", async () => {
    const response = await POST(
      request({
        userStep: {
          stepId: "00000000-0000-4000-8000-000000000010",
          outcome: "done",
        },
      })
    );
    expect(response.status).toBe(404);
    expect(mocks.handleAgentRequest).not.toHaveBeenCalled();
  });

  test("rejects more than two screenshot ids", async () => {
    const response = await POST(
      request({
        message: "Inspect these",
        attachmentIds: [
          "00000000-0000-4000-8000-000000000010",
          "00000000-0000-4000-8000-000000000011",
          "00000000-0000-4000-8000-000000000012",
        ],
      })
    );
    expect(response.status).toBe(400);
  });

  test.each([
    ["null platform", { message: "hello", platform: null }],
    ["omitted platform", { message: "hello" }],
  ])("accepts %s", async (_name, body) => {
    const response = await POST(request(body));
    await response.text();
    expect(response.status).toBe(200);
    expect(mocks.handleAgentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ platform: undefined })
    );
  });

  test("records a generic error when the agent cannot continue", async () => {
    mocks.handleAgentRequest.mockRejectedValue(new Error("internal details"));
    const response = await POST(request({ message: "hello" }));
    const text = await response.text();
    expect(text).toContain("The assistant could not continue safely.");
    expect(mocks.writeStep).toHaveBeenCalledWith(expect.anything(), session, {
      kind: "error",
      resultSummary: "The assistant could not continue safely.",
    });
  });

  test("starts SSE with the session event", async () => {
    const response = await POST(request({ message: "Wi-Fi keeps dropping" }));
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text.startsWith("data: ")).toBe(true);
    expect(JSON.parse(text.split("\n", 1)[0].slice(6))).toEqual({
      type: "session",
      sessionId: session.id,
    });
  });

  test("computes and persists only verified assurance facts when enabled", async () => {
    mocks.isIdentityAssuranceEnabled.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({
      auth: {
        getClaims: vi.fn(async () => ({
          data: {
            claims: {
              sub: "user",
              aal: "aal1",
              amr: [{ method: "password", timestamp: Date.now() / 1000 }],
              access_token: "must-not-be-forwarded",
            },
          },
        })),
      },
    });

    const response = await POST(request({ message: "hello" }));
    await response.text();

    expect(mocks.updateSession).toHaveBeenCalledWith(
      {},
      session,
      expect.objectContaining({
        assurance_level: "A2",
        assurance_method: "password",
        assurance_auth_at: expect.any(String),
        assurance_expires_at: expect.any(String),
      })
    );
    expect(mocks.writeStep).toHaveBeenCalledWith(
      {},
      session,
      expect.objectContaining({
        kind: "identity_assurance",
        resultSummary: expect.stringContaining('"level":"A2"'),
      })
    );
    expect(mocks.handleAgentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        assurance: {
          level: "A2",
          method: "password",
          authAt: expect.any(String),
          expiresAt: expect.any(String),
        },
      })
    );
    const args = mocks.handleAgentRequest.mock.calls[0][0];
    expect(JSON.stringify(args)).not.toContain("must-not-be-forwarded");
  });
});
