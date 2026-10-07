import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAnswerEngineEnabled: vi.fn(),
  getCurrentUser: vi.fn(),
  resolveOrganizationForUser: vi.fn(),
  checkRateLimit: vi.fn(),
  createRateLimiter: vi.fn(() => ({})),
  createAdminClient: vi.fn(),
  recordAnswerFeedback: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isAnswerEngineEnabled: mocks.isAnswerEngineEnabled,
}));
vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/org/membership", () => ({
  resolveOrganizationForUser: mocks.resolveOrganizationForUser,
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  createRateLimiter: mocks.createRateLimiter,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/answers/feedback", () => ({
  recordAnswerFeedback: mocks.recordAnswerFeedback,
}));

import { POST } from "./route";

const runId = "00000000-0000-4000-8000-000000000001";
const run = {
  id: runId,
  organization_id: "org-1",
  ticket_id: "ticket-1",
  created_at: new Date().toISOString(),
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/answers/feedback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "192.0.2.11",
    },
    body: JSON.stringify(body),
  });
}

function adminForRun(result: { data: unknown; error: unknown }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue(result),
        })),
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAnswerEngineEnabled.mockReturnValue(true);
  mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
  mocks.resolveOrganizationForUser.mockResolvedValue({
    organizationId: "org-1",
  });
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.recordAnswerFeedback.mockResolvedValue({ ok: true });
  mocks.createAdminClient.mockReturnValue(
    adminForRun({ data: run, error: null })
  );
});

describe("answer feedback route", () => {
  test("returns 404 when the answer engine is disabled", async () => {
    mocks.isAnswerEngineEnabled.mockReturnValue(false);
    const response = await POST(request({ runId, outcome: "fixed" }));

    expect(response.status).toBe(404);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  test("returns 429 when the IP limiter blocks the request", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      retryAfter: 90,
    });
    const response = await POST(request({ runId, outcome: "fixed" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("90");
  });

  test("rejects malformed feedback", async () => {
    const response = await POST(
      request({ runId: "not-a-uuid", outcome: "fixed" })
    );

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  test.each([
    ["missing", { data: null, error: null }],
    [
      "old",
      {
        data: {
          ...run,
          created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        },
        error: null,
      },
    ],
    ["unavailable", { data: null, error: new Error("database unavailable") }],
  ])("returns not found for %s or old runs", async (_label, result) => {
    mocks.createAdminClient.mockReturnValue(adminForRun(result));
    const response = await POST(request({ runId, outcome: "helpful" }));

    expect(response.status).toBe(result.error ? 500 : 404);
    expect(mocks.recordAnswerFeedback).not.toHaveBeenCalled();
  });

  test("hides organization-scoped runs from signed-out requesters", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await POST(request({ runId, outcome: "helpful" }));

    expect(response.status).toBe(404);
    expect(mocks.recordAnswerFeedback).not.toHaveBeenCalled();
  });

  test("hides organization-scoped runs from other organizations", async () => {
    mocks.resolveOrganizationForUser.mockResolvedValue({
      organizationId: "other-org",
    });
    const response = await POST(request({ runId, outcome: "helpful" }));

    expect(response.status).toBe(404);
    expect(mocks.recordAnswerFeedback).not.toHaveBeenCalled();
  });

  test("records same-organization feedback and treats duplicates as success", async () => {
    mocks.recordAnswerFeedback.mockResolvedValue({
      ok: true,
      duplicate: true,
    });
    const response = await POST(request({ runId, outcome: "fixed" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.resolveOrganizationForUser).toHaveBeenCalledWith("user-1");
    expect(mocks.recordAnswerFeedback).toHaveBeenCalledWith(expect.anything(), {
      runId,
      organizationId: "org-1",
      outcome: "fixed",
      ticketId: "ticket-1",
    });
  });

  test("allows feedback on recent public runs without authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.createAdminClient.mockReturnValue(
      adminForRun({
        data: { ...run, organization_id: null, ticket_id: null },
        error: null,
      })
    );
    const response = await POST(request({ runId, outcome: "not_helpful" }));

    expect(response.status).toBe(200);
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.recordAnswerFeedback).toHaveBeenCalledWith(expect.anything(), {
      runId,
      organizationId: null,
      outcome: "not_helpful",
      ticketId: null,
    });
  });

  test("returns an error when feedback persistence fails", async () => {
    mocks.recordAnswerFeedback.mockResolvedValue({ ok: false });
    const response = await POST(request({ runId, outcome: "helpful" }));

    expect(response.status).toBe(500);
  });
});
