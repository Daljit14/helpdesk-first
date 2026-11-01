import { describe, expect, test, vi } from "vitest";
import { listGuides } from "@/lib/knowledge/governance";
import {
  computeGuideFreshness,
  listGuideFreshness,
  resolveEffectiveGuides,
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

  test("open warnings with a distant review date need attention, not due soon", () => {
    const result = computeGuideFreshness(
      guide(),
      [finding("warning"), finding("warning")],
      null,
      now
    );
    expect(result).toMatchObject({ score: 60, state: "needs_attention" });
    expect(result.reviewDueAt).toBe(daysAgo(30 - 180));
  });

  test("a review due within two weeks stays due soon even with warnings", () => {
    const result = computeGuideFreshness(
      guide({ retrievedAt: daysAgo(170) }),
      [finding("warning")],
      null,
      now
    );
    expect(result).toMatchObject({ score: 70, state: "due_soon" });
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
    expect(undated.state).toBe("needs_attention");
  });
});

describe("flag off", () => {
  test("lists nothing and refuses to verify without touching the database", async () => {
    await expect(listGuideFreshness("org")).resolves.toEqual([]);
    await expect(
      verifyGuide({ orgId: "org", guideSlug: "vpn-reset", actorId: "u" })
    ).resolves.toEqual({ error: "Not available." });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

type Page = { data: unknown; error: unknown };

function tableQuery(pages: Page[], awaited: Page = { data: [], error: null }) {
  let call = 0;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    not: vi.fn(() => query),
    order: vi.fn(() => query),
    or: vi.fn(() => query),
    update: vi.fn(() => query),
    range: vi.fn(async () => pages[Math.min(call++, pages.length - 1)]),
    insert: vi.fn<(row: Record<string, unknown>) => Promise<Page>>(
      async () => ({ data: null, error: null })
    ),
    then: (resolve: (value: Page) => unknown) => resolve(awaited),
  };
  return query;
}

function adminWith(tables: Record<string, ReturnType<typeof tableQuery>>) {
  createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => tables[table]),
  });
}

const row = (
  id: string,
  slug: string,
  organizationId: string | null,
  status: "draft" | "in_review" | "approved" | "retired",
  version = 1
) => ({
  ...guide({ slug }),
  id,
  organizationId,
  status,
  version,
});

describe("resolveEffectiveGuides", () => {
  test("follows the approved catalog's override rules", () => {
    const effective = resolveEffectiveGuides([
      row("g-vpn", "vpn", null, "approved"),
      row("o-vpn", "vpn", "org", "approved"),
      row("g-wifi", "wifi", null, "approved"),
      row("o-wifi", "wifi", "org", "retired"),
      row("g-mail", "mail", null, "approved"),
      row("o-mail", "mail", "org", "draft"),
      row("g-old", "old", null, "retired"),
    ]);
    expect(effective.map((g) => g.id).sort()).toEqual(["g-mail", "o-vpn"]);
  });
});

describe("listGuideFreshness", () => {
  test("scores one guide per slug with every open finding and only reviews of the current version", async () => {
    enabled.mockReturnValue(true);
    vi.mocked(listGuides).mockResolvedValue([
      row("g-vpn", "vpn-reset", null, "approved", 2),
      row("g-wifi", "wifi", null, "approved"),
      row("o-wifi", "wifi", "org", "approved"),
    ] as never);
    const filler = Array.from({ length: 1000 }, () => ({
      guide_slug: "other",
      kind: "low_success",
      severity: "info",
    }));
    const findings = tableQuery([
      { data: filler, error: null },
      {
        data: [
          {
            guide_slug: "vpn-reset",
            kind: "low_success",
            severity: "critical",
          },
        ],
        error: null,
      },
    ]);
    const verifications = tableQuery([
      {
        data: [
          { guide_id: "g-vpn", guide_version: 1, verified_at: daysAgo(1) },
          { guide_id: "o-wifi", guide_version: 1, verified_at: daysAgo(2) },
        ],
        error: null,
      },
    ]);
    adminWith({
      knowledge_health_findings: findings,
      knowledge_guide_verifications: verifications,
    });
    const result = await listGuideFreshness("org", now);
    expect(result.map((r) => r.slug)).toEqual(["vpn-reset", "wifi"]);
    expect(result[0]).toMatchObject({
      state: "at_risk",
      lastVerifiedAt: null,
      openFindings: 1,
    });
    expect(result[1].lastVerifiedAt).toBe(daysAgo(2));
    expect(findings.range).toHaveBeenCalledTimes(2);
  });
});

describe("verifyGuide", () => {
  test("records the effective guide id and version", async () => {
    enabled.mockReturnValue(true);
    const guides = tableQuery([], {
      data: [
        {
          id: "g-vpn",
          organization_id: null,
          slug: "vpn-reset",
          status: "approved",
          version: 3,
        },
        {
          id: "o-vpn",
          organization_id: "org",
          slug: "vpn-reset",
          status: "draft",
          version: 1,
        },
      ],
      error: null,
    });
    const verifications = tableQuery([]);
    adminWith({
      knowledge_guides: guides,
      knowledge_guide_verifications: verifications,
      knowledge_health_findings: tableQuery([]),
    });
    await expect(
      verifyGuide({ orgId: "org", guideSlug: "vpn-reset", actorId: "u" })
    ).resolves.toEqual({ success: true });
    expect(verifications.insert.mock.calls[0][0]).toMatchObject({
      guide_id: "g-vpn",
      guide_version: 3,
      guide_slug: "vpn-reset",
    });
  });

  test("refuses a slug the organization retired", async () => {
    enabled.mockReturnValue(true);
    adminWith({
      knowledge_guides: tableQuery([], {
        data: [
          {
            id: "g-vpn",
            organization_id: null,
            slug: "vpn-reset",
            status: "approved",
            version: 1,
          },
          {
            id: "o-vpn",
            organization_id: "org",
            slug: "vpn-reset",
            status: "retired",
            version: 1,
          },
        ],
        error: null,
      }),
    });
    await expect(
      verifyGuide({ orgId: "org", guideSlug: "vpn-reset", actorId: "u" })
    ).resolves.toEqual({ error: "Guide not found." });
  });
});
