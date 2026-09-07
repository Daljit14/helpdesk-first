import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getApprovedSlugs,
  listGuideRevisions,
  transitionGuide,
} from "./governance";

const { createAdminClient } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

const guide = {
  id: "00000000-0000-0000-0000-000000000001",
  organization_id: null,
  slug: "slow-computer",
  title: "Slow computer",
  status: "in_review",
  version: 1,
  reviewer: null,
};

function adminForGuide() {
  const revisionInsert = vi.fn(async () => ({ error: null }));
  const updateEq = vi.fn(async () => ({ error: null }));
  const guideQuery = {
    select: vi.fn(() => guideQuery),
    eq: vi.fn(() => guideQuery),
    maybeSingle: vi.fn(async () => ({ data: guide, error: null })),
    update: vi.fn(() => ({ eq: updateEq })),
  };
  const admin = {
    from: vi.fn((table: string) =>
      table === "knowledge_guides" ? guideQuery : { insert: revisionInsert }
    ),
    rpc: vi.fn(),
  };
  return { admin, revisionInsert, updateEq };
}

afterEach(() => {
  delete process.env.HELP_DESK_KNOWLEDGE_GOVERNANCE_ENABLED;
  vi.clearAllMocks();
});

describe("knowledge governance", () => {
  test("flag off returns the complete issue catalog", async () => {
    delete process.env.HELP_DESK_KNOWLEDGE_GOVERNANCE_ENABLED;
    const slugs = await getApprovedSlugs(null);
    expect(slugs).toContain("slow-computer");
    expect(slugs.length).toBeGreaterThan(40);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  test("allows an in-review guide to be approved and records a revision", async () => {
    process.env.HELP_DESK_KNOWLEDGE_GOVERNANCE_ENABLED = "true";
    const { admin, revisionInsert, updateEq } = adminForGuide();
    createAdminClient.mockReturnValue(admin);

    await expect(
      transitionGuide({
        guideId: guide.id,
        to: "approved",
        actorId: "00000000-0000-0000-0000-000000000002",
        reviewer: "Reviewer",
      })
    ).resolves.toEqual({ success: true });
    expect(revisionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        from_status: "in_review",
        to_status: "approved",
        version: 1,
        prior_snapshot: guide,
      })
    );
    expect(updateEq).toHaveBeenCalled();
    expect(updateEq).toHaveBeenCalledWith("id", guide.id);
  });

  test("blocks invalid transitions and approvals without a reviewer", async () => {
    process.env.HELP_DESK_KNOWLEDGE_GOVERNANCE_ENABLED = "true";
    const { admin } = adminForGuide();
    createAdminClient.mockReturnValue(admin);

    await expect(
      transitionGuide({
        guideId: guide.id,
        to: "approved",
        actorId: "00000000-0000-0000-0000-000000000002",
      })
    ).resolves.toEqual({
      error: "A reviewer is required to approve a guide.",
    });
    await expect(
      transitionGuide({
        guideId: guide.id,
        to: "retired",
        actorId: "00000000-0000-0000-0000-000000000002",
      })
    ).resolves.toEqual({ error: "That guide transition is not allowed." });
  });

  test("maps revision history for a guide", async () => {
    process.env.HELP_DESK_KNOWLEDGE_GOVERNANCE_ENABLED = "true";
    const revisions = [
      {
        id: "revision-1",
        from_status: "draft",
        to_status: "in_review",
        version: 1,
        note: "Ready for review",
        prior_snapshot: { reviewer: "Reviewer" },
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      or: vi.fn(() => query),
      order: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: revisions, error: null }),
    };
    createAdminClient.mockReturnValue({
      from: vi.fn(() => query),
    });
    await expect(listGuideRevisions(guide.id, "org-a")).resolves.toEqual([
      {
        id: "revision-1",
        fromStatus: "draft",
        toStatus: "in_review",
        version: 1,
        note: "Ready for review",
        reviewer: "Reviewer",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });
});
