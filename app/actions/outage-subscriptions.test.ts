import { beforeEach, describe, expect, test, vi } from "vitest";
import { subscribeToOutage } from "./outage-subscriptions";

const mocks = vi.hoisted(() => {
  const rateCheck = vi.fn();
  return {
    isServiceHealthEnabled: vi.fn(),
    getCurrentUser: vi.fn(),
    createAdminClient: vi.fn(),
    getServiceHealth: vi.fn(),
    rateCheck,
    createRateLimiter: vi.fn(() => ({ check: rateCheck })),
  };
});

vi.mock("@/lib/admin/flags", () => ({
  isServiceHealthEnabled: mocks.isServiceHealthEnabled,
}));
vi.mock("@/lib/supabase/user", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/service-health", () => ({
  getServiceHealth: mocks.getServiceHealth,
}));
vi.mock("@/lib/ai/rate-limit", () => ({
  createRateLimiter: mocks.createRateLimiter,
  getRateLimitConfig: vi.fn(() => ({ windowMs: 60_000, maxRequests: 30 })),
}));

const user = { id: "requester-7" };
const sessionId = "00000000-0000-4000-8000-000000000001";
const incident = {
  source: "microsoft365" as const,
  incidentId: "EX123",
  service: "Exchange Online",
  title: "Mail delivery is delayed",
  impact: "outage" as const,
  startedAt: "2026-09-01T00:00:00.000Z",
  url: "https://admin.microsoft.com/Adminportal/Home#/servicehealth",
};

function makeAdmin(
  options: {
    session?: Record<string, unknown> | null;
    sessionError?: { code?: string } | null;
    insertError?: { code?: string } | null;
  } = {}
) {
  const sessionQuery: Record<string, (...args: unknown[]) => unknown> = {};
  const select = vi.fn(() => sessionQuery);
  const eq = vi.fn(() => sessionQuery);
  const maybeSingle = vi.fn(async () => ({
    data:
      options.session === undefined
        ? {
            id: sessionId,
            organization_id: "org-derived-from-session",
            requester_id: user.id,
          }
        : options.session,
    error: options.sessionError ?? null,
  }));
  Object.assign(sessionQuery, { select, eq, maybeSingle });
  const insert = vi.fn(async () => ({ error: options.insertError ?? null }));
  const from = vi.fn((table: string) =>
    table === "agent_sessions" ? sessionQuery : { insert }
  );
  return { from, select, eq, maybeSingle, insert };
}

beforeEach(() => {
  mocks.isServiceHealthEnabled.mockClear();
  mocks.getCurrentUser.mockClear();
  mocks.createAdminClient.mockClear();
  mocks.getServiceHealth.mockClear();
  mocks.rateCheck.mockClear();
  mocks.isServiceHealthEnabled.mockReturnValue(true);
  mocks.getCurrentUser.mockResolvedValue(user);
  mocks.rateCheck.mockResolvedValue({ allowed: true });
  mocks.createRateLimiter.mockReturnValue({ check: mocks.rateCheck });
  mocks.getServiceHealth.mockResolvedValue({
    incidents: [incident],
    sources: [{ source: "microsoft365", name: "Microsoft 365", ok: true }],
    checkedAt: "2026-09-01T00:00:00.000Z",
  });
});

describe("subscribeToOutage", () => {
  const input = {
    sessionId,
    source: "microsoft365",
    incidentId: "EX123",
  };

  test("is disabled by default without authenticating or querying storage", async () => {
    mocks.isServiceHealthEnabled.mockReturnValue(false);
    await expect(subscribeToOutage(input)).resolves.toEqual({
      ok: false,
      error: "disabled",
    });
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  test("requires an authenticated requester", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(subscribeToOutage(input)).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  test.each([
    ["invalid session id", { ...input, sessionId: "not-a-uuid" }],
    ["invalid source", { ...input, source: "other" }],
    ["invalid incident id", { ...input, incidentId: "../EX123" }],
    ["extra target field", { ...input, userId: "another-user" }],
  ])("rejects %s", async (_name, invalidInput) => {
    await expect(subscribeToOutage(invalidInput as never)).resolves.toEqual({
      ok: false,
      error: "invalid",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  test("rate limits by the exact outage requester key", async () => {
    mocks.rateCheck.mockResolvedValue({ allowed: false });
    await expect(subscribeToOutage(input)).resolves.toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect(mocks.rateCheck).toHaveBeenCalledWith("outage:user:requester-7");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  test("looks up a matching active incident and stores only server-derived data", async () => {
    const admin = makeAdmin();
    mocks.createAdminClient.mockReturnValue(admin);

    await expect(subscribeToOutage(input)).resolves.toEqual({ ok: true });

    expect(mocks.createRateLimiter).toHaveBeenCalledWith(
      { windowMs: 60_000, maxRequests: 10 },
      "outage-subscriptions"
    );
    expect(admin.from).toHaveBeenCalledWith("agent_sessions");
    expect(admin.select).toHaveBeenCalledWith(
      "id,organization_id,requester_id"
    );
    expect(admin.eq).toHaveBeenNthCalledWith(1, "id", sessionId);
    expect(admin.eq).toHaveBeenNthCalledWith(2, "requester_id", user.id);
    expect(mocks.getServiceHealth).toHaveBeenCalledWith(
      admin,
      "org-derived-from-session",
      expect.any(AbortSignal)
    );
    expect(admin.from).toHaveBeenCalledWith("outage_subscriptions");
    expect(admin.insert).toHaveBeenCalledWith({
      organization_id: "org-derived-from-session",
      user_id: user.id,
      session_id: sessionId,
      source: incident.source,
      incident_id: incident.incidentId,
      service: incident.service,
      title: incident.title,
      incident_url: incident.url,
      status: "active",
    });
  });

  test("subscribes to a prefixed Statuspage incident id", async () => {
    const prefixedIncident = {
      ...incident,
      source: "statuspage" as const,
      incidentId: "status-source:sp-789",
      service: "Contoso Mail",
    };
    const admin = makeAdmin();
    mocks.createAdminClient.mockReturnValue(admin);
    mocks.getServiceHealth.mockResolvedValue({
      incidents: [prefixedIncident],
      sources: [
        {
          source: "statuspage",
          sourceId: "status-source",
          name: "Contoso Mail",
          ok: true,
        },
      ],
      checkedAt: "2026-09-01T00:00:00.000Z",
    });

    await expect(
      subscribeToOutage({
        sessionId,
        source: "statuspage",
        incidentId: "status-source:sp-789",
      })
    ).resolves.toEqual({ ok: true });
    expect(admin.insert).toHaveBeenCalledWith(
      expect.objectContaining({ incident_id: "status-source:sp-789" })
    );
  });

  test("does not subscribe when the incident is no longer active", async () => {
    mocks.createAdminClient.mockReturnValue(makeAdmin());
    mocks.getServiceHealth.mockResolvedValue({
      incidents: [],
      sources: [{ source: "microsoft365", name: "Microsoft 365", ok: true }],
      checkedAt: "2026-09-01T00:00:00.000Z",
    });
    await expect(subscribeToOutage(input)).resolves.toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      mocks.createAdminClient.mock.results[0]?.value.insert
    ).not.toHaveBeenCalled();
  });

  test("returns not found for sessions not owned by the requester", async () => {
    const admin = makeAdmin({ session: null });
    mocks.createAdminClient.mockReturnValue(admin);
    await expect(subscribeToOutage(input)).resolves.toEqual({
      ok: false,
      error: "not_found",
    });
    expect(mocks.getServiceHealth).not.toHaveBeenCalled();
    expect(admin.from).toHaveBeenCalledTimes(1);
  });

  test("treats unique conflicts as an existing subscription", async () => {
    mocks.createAdminClient.mockReturnValue(
      makeAdmin({ insertError: { code: "23505" } })
    );
    await expect(subscribeToOutage(input)).resolves.toEqual({ ok: true });
  });
});
