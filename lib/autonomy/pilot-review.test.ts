import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  alertSecurityEvent: vi.fn(),
  setKillSwitch: vi.fn(),
  writeRunEvent: vi.fn(),
}));

vi.mock("./alerts", () => ({ alertSecurityEvent: mocks.alertSecurityEvent }));
vi.mock("./kill-switches", () => ({ setKillSwitch: mocks.setKillSwitch }));
vi.mock("./orchestrator", () => ({ writeRunEvent: mocks.writeRunEvent }));

import {
  createPilotReview,
  handleAutonomousReopen,
  resumePilot,
  reviewPilotResolution,
} from "./pilot-review";

type PilotAdmin = Parameters<typeof createPilotReview>[0];
type TestAdmin = PilotAdmin & {
  inserts: Record<string, unknown>[];
  updates: Record<string, unknown>[];
};

function makeAdmin(
  options: {
    review?: Record<string, unknown> | null;
    reviews?: Record<string, unknown>[];
    switchReason?: string | null;
  } = {}
): TestAdmin {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ["select", "eq", "in", "update", "insert"]) {
      chain[method] = (...args: unknown[]) => {
        if (method === "update") {
          updates.push((args[0] ?? {}) as Record<string, unknown>);
        }
        if (method === "insert")
          inserts.push((args[0] ?? {}) as Record<string, unknown>);
        return chain;
      };
    }
    chain.maybeSingle = async () => {
      if (table === "pilot_reviews")
        return { data: options.review ?? null, error: null };
      if (table === "ai_kill_switches")
        return {
          data:
            options.switchReason === undefined
              ? null
              : { reason: options.switchReason },
          error: null,
        };
      return { data: null, error: null };
    };
    chain.then = (...args: unknown[]) => {
      const resolve = args[0] as (value: unknown) => unknown;
      return Promise.resolve({
        data: table === "pilot_reviews" ? (options.reviews ?? []) : null,
        error: null,
      }).then(resolve);
    };
    return chain;
  });
  return { from, inserts, updates } as unknown as TestAdmin;
}

const run = {
  id: "run-1",
  organization_id: "org-1",
  ticket_id: "ticket-1",
} as Parameters<typeof createPilotReview>[1];

describe("pilot review lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    mocks.setKillSwitch.mockResolvedValue({ ok: true });
  });

  afterEach(() => vi.unstubAllEnvs());

  test("does nothing when execution is disabled and inserts a bound review when enabled", async () => {
    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "false");
    const disabled = makeAdmin();
    await createPilotReview(disabled, run, null);
    expect(disabled.from).not.toHaveBeenCalled();

    vi.stubEnv("HELP_DESK_AUTONOMOUS_EXECUTION_ENABLED", "true");
    const enabled = makeAdmin();
    await createPilotReview(enabled, run, {
      id: "safe_capability",
      version: 1,
    } as Parameters<typeof createPilotReview>[2]);
    expect(enabled.inserts[0]).toEqual(
      expect.objectContaining({
        organization_id: "org-1",
        run_id: "run-1",
        ticket_id: "ticket-1",
        capability_id: "safe_capability",
        capability_version: 1,
        review_status: "pending",
        review_source: "admin",
      })
    );
  });

  test("reviews only the organization-scoped row and pauses unsafe reviews", async () => {
    const admin = makeAdmin({
      review: { run_id: "run-1", ticket_id: "ticket-1" },
    });
    await expect(
      reviewPilotResolution(admin, {
        id: "review-1",
        organizationId: "org-1",
        status: "unsafe",
        note: "Unsafe result",
        reviewerId: "admin-1",
      })
    ).resolves.toEqual({ ok: true });
    expect(mocks.setKillSwitch).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ reason: "pilot_auto_pause:unsafe_review" })
    );
    expect(mocks.writeRunEvent).toHaveBeenCalled();
  });

  test("returns not found for an absent review", async () => {
    await expect(
      reviewPilotResolution(makeAdmin(), {
        id: "review-1",
        organizationId: "org-1",
        status: "confirmed",
        note: null,
        reviewerId: "admin-1",
      })
    ).resolves.toEqual({ ok: false, error: "Pilot review not found." });
  });

  test("updates only reviews reopened within seven days and pauses within 24 hours", async () => {
    const now = Date.now();
    const admin = makeAdmin({
      reviews: [
        {
          id: "old",
          run_id: "run-old",
          resolved_at: new Date(now - 8 * 86_400_000).toISOString(),
        },
        {
          id: "recent",
          run_id: "run-recent",
          resolved_at: new Date(now - 3 * 86_400_000).toISOString(),
        },
        {
          id: "urgent",
          run_id: "run-urgent",
          resolved_at: new Date(now - 2 * 3_600_000).toISOString(),
        },
      ],
    });
    await handleAutonomousReopen(admin, {
      organizationId: "org-1",
      ticketId: "ticket-1",
    });
    expect(admin.updates).toHaveLength(2);
    expect(mocks.setKillSwitch).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ reason: "pilot_auto_pause:reopen_within_24h" })
    );
  });

  test("only resumes an automatic pilot pause", async () => {
    await expect(
      resumePilot(
        makeAdmin({ switchReason: "manual_pause" }),
        "org-1",
        "admin-1"
      )
    ).resolves.toEqual({
      ok: false,
      error: "Pilot is not paused by an automatic pilot pause.",
    });

    await expect(
      resumePilot(
        makeAdmin({ switchReason: "pilot_auto_pause:breaker" }),
        "org-1",
        "admin-1"
      )
    ).resolves.toEqual({ ok: true });
    expect(mocks.setKillSwitch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        enabled: false,
        reason: "pilot_resumed",
        setBy: "admin-1",
      })
    );
  });
});
