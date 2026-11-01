import { describe, expect, test, vi } from "vitest";
import {
  computeGuideFreshness,
  listGuideFreshness,
  verifyGuide,
} from "./freshness";

const { enabled, createAdminClient } = vi.hoisted(() => ({
  enabled: vi.fn(() => false),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({ isKnowledgeFreshnessEnabled: enabled }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/knowledge/governance", () => ({ listGuides: vi.fn() }));

const now = new Date("2026-10-29T12:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(now.getTime() - days * 86_400_000).toISOString();
const guide = (overrides: Record<string, string | null> = {}) => ({
  slug: "vpn-reset",
  title: "Reset VPN",
  retrievedAt: daysAgo(30),
  expiresAt: null,
  createdAt: daysAgo(400),
  ...overrides,
});
const finding = (
  severity: string,
  status: "open" | "acknowledged" | "dismissed" = "open",
  guideSlug = "vpn-reset"
) => ({
  guideSlug,
  kind: "low_success",
  severity,
  status,
});

describe("computeGuideFreshness", () => {
  test("recently sourced guide with no findings is fresh", () => {
    const result = computeGuideFreshness(guide(), [], null, now);
    expect(result).toMatchObject({ score: 100, state: "fresh", reasons: [] });
    expect(result.reviewDueAt).toBe(daysAgo(30 - 180));
  });

  test("flags a review that is due within two weeks", () => {
    const result = computeGuideFreshness(
      guide({ retrievedAt: daysAgo(170) }),
      [],
      null,
      now
    );
    expect(result).toMatchObject({ score: 90, state: "due_soon" });
  });

  test("flags an overdue review", () => {
    const result = computeGuideFreshness(
      guide({ retrievedAt: daysAgo(200) }),
      [],
      null,
      now
    );
    expect(result).toMatchObject({ score: 70, state: "overdue" });
  });

  test("a later verification restarts the review clock", () => {
    const result = computeGuideFreshness(
      guide({ retrievedAt: daysAgo(400) }),
      [],
      daysAgo(1),
      now
    );
    expect(result).toMatchObject({ score: 100, state: "fresh" });
    expect(result.lastVerifiedAt).toBe(daysAgo(1));
  });

  test("an expiry date wins over the review cycle and verification", () => {
    const result = computeGuideFreshness(
      guide({ expiresAt: daysAgo(2) }),
      [],
      daysAgo(1),
      now
    );
    expect(result).toMatchObject({ score: 50, state: "expired" });
    expect(result.reviewDueAt).toBe(daysAgo(2));
  });

  test("an open critical finding makes the guide at risk", () => {
    const result = computeGuideFreshness(
      guide(),
      [finding("critical")],
      null,
      now
    );
    expect(result).toMatchObject({
      score: 60,
      state: "at_risk",
      openFindings: 1,
    });
  });

  test("ignores reviewed findings and findings for other guides", () => {
    const result = computeGuideFreshness(
      guide(),
      [
        finding("critical", "acknowledged"),
        finding("warning", "open", "other"),
      ],
      null,
      now
    );
    expect(result).toMatchObject({ score: 100, state: "fresh" });
  });

  test("score never drops below zero", () => {
    const result = computeGuideFreshness(
      guide({ expiresAt: daysAgo(1) }),
      [finding("critical"), finding("critical"), finding("warning")],
      null,
      now
    );
    expect(result.score).toBe(0);
  });

  test("falls back to creation date when no source date exists", () => {
    const result = computeGuideFreshness(
      guide({ retrievedAt: null, createdAt: daysAgo(10) }),
      [],
      null,
      now
    );
    expect(result.state).toBe("fresh");
    const undated = computeGuideFreshness(
      guide({ retrievedAt: null, createdAt: null }),
      [],
      null,
      now
    );
    expect(undated).toMatchObject({ score: 80, reviewDueAt: null });
    expect(undated.state).toBe("due_soon");
  });
});

describe("flag off", () => {
  test("lists nothing and refuses to verify without touching the database", async () => {
    await expect(listGuideFreshness("org", [])).resolves.toEqual([]);
    await expect(
      verifyGuide({ orgId: "org", guideSlug: "vpn-reset", actorId: "u" })
    ).resolves.toEqual({ error: "Not available." });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
