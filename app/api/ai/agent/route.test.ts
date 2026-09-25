import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveOrganizationForUser: vi.fn(),
  isRequesterAgentEnabled: vi.fn(),
  isRequesterAgentEnabledForOrg: vi.fn(),
  checkRateLimit: vi.fn(),
  createRateLimiter: vi.fn(() => ({})),
  createAdminClient: vi.fn(),
  createSession: vi.fn(),
  loadActiveSession: vi.fn(),
  writeStep: vi.fn(),
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
  isRequesterAgentEnabled: mocks.isRequesterAgentEnabled,
  isRequesterAgentEnabledForOrg: mocks.isRequesterAgentEnabledForOrg,
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
  writeStep: mocks.writeStep,
  escalate: mocks.escalate,
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
  mocks.getCurrentUser.mockResolvedValue({ id: "user" });
  mocks.resolveOrganizationForUser.mockResolvedValue({ organizationId: "org" });
  mocks.isRequesterAgentEnabled.mockReturnValue(true);
  mocks.isRequesterAgentEnabledForOrg.mockReturnValue(true);
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.createSession.mockResolvedValue(session);
  mocks.loadActiveSession.mockResolvedValue(session);
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
});
