import { afterEach, describe, expect, test, vi } from "vitest";
import {
  classifyLink,
  detectConflicting,
  detectHighEscalation,
  detectLowSuccess,
  detectMissingGuides,
  detectOutdated,
  runKnowledgeHealthScan,
} from "./health";

const { enabled, createAdminClient } = vi.hoisted(() => ({
  enabled: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin/flags", () => ({
  isKnowledgeHealthEnabled: enabled,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/knowledge/governance", () => ({
  listGuides: vi.fn(async () => []),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("knowledge health detectors", () => {
  test("detects expired and stale guides", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(
      detectOutdated(
        [
          {
            slug: "expired",
            status: "approved",
            expiresAt: "2025-12-31T23:59:59Z",
            retrievedAt: null,
            sourceUrl: null,
          },
          {
            slug: "stale",
            status: "approved",
            expiresAt: null,
            retrievedAt: "2024-12-31T23:59:59Z",
            sourceUrl: null,
          },
        ],
        now
      )
    ).toMatchObject([
      { kind: "outdated", severity: "critical", guideSlug: "expired" },
      { kind: "outdated", severity: "warning", guideSlug: "stale" },
    ]);
  });

  test("detects low success at warning and critical thresholds", () => {
    const findings = detectLowSuccess([
      {
        slug: "warning",
        ticketsRecommended: 0,
        ticketsResolvedByAi: 0,
        ticketsEscalatedAfterGuide: 0,
        worked: 5,
        failed: 4,
        couldNotPerform: 1,
      },
      {
        slug: "critical",
        ticketsRecommended: 0,
        ticketsResolvedByAi: 0,
        ticketsEscalatedAfterGuide: 0,
        worked: 1,
        failed: 6,
        couldNotPerform: 1,
      },
      {
        slug: "too-small",
        ticketsRecommended: 0,
        ticketsResolvedByAi: 0,
        ticketsEscalatedAfterGuide: 0,
        worked: 2,
        failed: 2,
        couldNotPerform: 0,
      },
    ]);
    expect(findings).toMatchObject([
      { guideSlug: "warning", severity: "warning" },
      { guideSlug: "critical", severity: "critical" },
    ]);
  });

  test("detects high escalation only at the minimum sample", () => {
    expect(
      detectHighEscalation([
        {
          slug: "high",
          ticketsRecommended: 5,
          ticketsResolvedByAi: 0,
          ticketsEscalatedAfterGuide: 3,
          worked: 0,
          failed: 0,
          couldNotPerform: 0,
        },
        {
          slug: "too-small",
          ticketsRecommended: 4,
          ticketsResolvedByAi: 0,
          ticketsEscalatedAfterGuide: 4,
          worked: 0,
          failed: 0,
          couldNotPerform: 0,
        },
      ])
    ).toMatchObject([{ guideSlug: "high", severity: "warning" }]);
  });

  test("detects missing guides without raw message text", () => {
    const findings = detectMissingGuides([
      {
        normalizedTitle: "printer not printing",
        count: 3,
      },
      {
        normalizedTitle: "one occurrence with secret@example.com",
        count: 2,
      },
    ]);
    expect(findings).toMatchObject([
      {
        kind: "missing_guide",
        guideSlug: null,
        evidence: { normalizedTitle: "printer not printing", count: 3 },
      },
    ]);
    expect(findings[0]?.summary).not.toContain("secret@example.com");
  });

  test("detects conflicts between global and organization guides", () => {
    expect(
      detectConflicting([
        {
          slug: "global-guide",
          title: "Printer offline!",
          status: "approved",
          organizationId: null,
          expiresAt: null,
          retrievedAt: null,
          sourceUrl: null,
        },
        {
          slug: "org-guide",
          title: "Printer offline",
          status: "approved",
          organizationId: "org-1",
          expiresAt: null,
          retrievedAt: null,
          sourceUrl: null,
        },
      ])
    ).toMatchObject([
      { kind: "conflicting", guideSlug: "global-guide", severity: "info" },
      { kind: "conflicting", guideSlug: "org-guide", severity: "info" },
    ]);
  });

  test("classifies broken and healthy links", () => {
    expect(classifyLink(200)).toBeNull();
    expect(classifyLink(404)).toMatchObject({
      kind: "broken_link",
      severity: "critical",
    });
    expect(classifyLink(500)).toMatchObject({
      kind: "broken_link",
      severity: "warning",
    });
    expect(classifyLink("unreachable")).toMatchObject({
      kind: "broken_link",
      severity: "warning",
    });
  });
});

describe("knowledge health scan", () => {
  test("returns zeros while disabled", async () => {
    enabled.mockReturnValue(false);
    await expect(runKnowledgeHealthScan("org-1")).resolves.toEqual({
      findings: 0,
      linksChecked: 0,
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
