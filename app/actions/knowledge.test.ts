import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  reviewKnowledgeDraft,
  transitionKnowledgeGuide,
  updateKnowledgeGuideMetadata,
} from "./knowledge";

const {
  getAdminSession,
  recordAudit,
  governanceEnabled,
  learningEnabled,
  transitionGuide,
  updateGuideMetadata,
  reviewDraft,
} = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
  governanceEnabled: vi.fn(),
  learningEnabled: vi.fn(),
  transitionGuide: vi.fn(),
  updateGuideMetadata: vi.fn(),
  reviewDraft: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ getAdminSession, recordAudit }));
vi.mock("@/lib/admin/flags", () => ({
  isKnowledgeGovernanceEnabled: governanceEnabled,
  isKnowledgeLearningEnabled: learningEnabled,
}));
vi.mock("@/lib/knowledge/governance", () => ({
  transitionGuide,
  updateGuideMetadata,
}));
vi.mock("@/lib/knowledge/learning", () => ({
  reviewKnowledgeDraft: reviewDraft,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const admin = {
  userId: "00000000-0000-0000-0000-000000000001",
  email: "admin@example.com",
  role: "org_admin" as const,
  organizationId: "00000000-0000-0000-0000-000000000002",
  displayName: "Admin",
};

const validId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  governanceEnabled.mockReturnValue(true);
  learningEnabled.mockReturnValue(true);
  getAdminSession.mockResolvedValue(admin);
  transitionGuide.mockResolvedValue({ success: true });
  updateGuideMetadata.mockResolvedValue({ success: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("knowledge actions", () => {
  test("returns unavailable when governance is disabled", async () => {
    governanceEnabled.mockReturnValue(false);
    await expect(
      transitionKnowledgeGuide({ guideId: validId, to: "in_review" })
    ).resolves.toEqual({ error: "Not available." });
    expect(getAdminSession).not.toHaveBeenCalled();
  });

  test("denies unauthenticated and support-agent writes", async () => {
    getAdminSession.mockResolvedValueOnce(null);
    await expect(
      transitionKnowledgeGuide({ guideId: validId, to: "in_review" })
    ).resolves.toEqual({ error: "Not authorized." });

    getAdminSession.mockResolvedValueOnce({ ...admin, role: "support_agent" });
    await expect(
      updateKnowledgeGuideMetadata({ guideId: validId, riskTier: "low" })
    ).resolves.toEqual({ error: "Not authorized." });
  });

  test("rejects invalid transition and metadata input", async () => {
    await expect(
      transitionKnowledgeGuide({ guideId: "not-a-uuid", to: "in_review" })
    ).resolves.toEqual({ error: "Invalid guide transition." });
    await expect(
      updateKnowledgeGuideMetadata({
        guideId: validId,
        sourceUrl: "not-a-url",
      })
    ).resolves.toEqual({ error: "Invalid guide metadata." });
    expect(transitionGuide).not.toHaveBeenCalled();
    expect(updateGuideMetadata).not.toHaveBeenCalled();
  });

  test("passes validated input to governance and audits successful writes", async () => {
    await expect(
      transitionKnowledgeGuide({
        guideId: validId,
        to: "approved",
        reviewer: " Reviewer ",
        note: " Ready ",
      })
    ).resolves.toEqual({ success: true });
    expect(transitionGuide).toHaveBeenCalledWith({
      guideId: validId,
      to: "approved",
      reviewer: "Reviewer",
      note: "Ready",
      actorId: admin.userId,
    });
    expect(recordAudit).toHaveBeenCalledWith(
      admin,
      "knowledge.transition",
      validId
    );
  });

  test("reviews learning drafts and audits the decision for org admins", async () => {
    reviewDraft.mockResolvedValue({ success: true });
    await expect(
      reviewKnowledgeDraft({
        draftId: validId,
        decision: "approve_new",
        note: " Looks good ",
      })
    ).resolves.toEqual({ success: true });
    expect(reviewDraft).toHaveBeenCalledWith({
      draftId: validId,
      decision: "approve_new",
      note: "Looks good",
      organizationId: admin.organizationId,
      actorId: admin.userId,
    });
    expect(recordAudit).toHaveBeenCalledWith(
      admin,
      "knowledge.draft_approve_new",
      validId
    );
  });

  test("denies support agents for every draft decision", async () => {
    getAdminSession.mockResolvedValue({ ...admin, role: "support_agent" });
    const decisions = [
      { decision: "approve_new" },
      { decision: "approve_revision", targetSlug: "no-internet" },
      { decision: "security_review" },
      { decision: "reject", reason: "Not suitable." },
      { decision: "regenerate", instructions: "Try again." },
      { decision: "edit", edits: { title: "Edited" } },
      { decision: "discard" },
    ] as const;
    for (const decision of decisions) {
      await expect(
        reviewKnowledgeDraft({ draftId: validId, ...decision })
      ).resolves.toEqual({ error: "Not authorized." });
    }
    expect(reviewDraft).not.toHaveBeenCalled();
  });

  test("denies requesters and unauthenticated users", async () => {
    getAdminSession.mockResolvedValueOnce(null);
    await expect(
      reviewKnowledgeDraft({ draftId: validId, decision: "approve_new" })
    ).resolves.toEqual({ error: "Not authorized." });
    getAdminSession.mockResolvedValueOnce({
      ...admin,
      role: "requester",
    });
    await expect(
      reviewKnowledgeDraft({ draftId: validId, decision: "approve_new" })
    ).resolves.toEqual({ error: "Not authorized." });
  });

  test("rejects invalid draft decision payloads", async () => {
    await expect(
      reviewKnowledgeDraft({ draftId: validId, decision: "not-a-decision" })
    ).resolves.toEqual({ error: "Invalid draft review." });
    await expect(
      reviewKnowledgeDraft({ draftId: validId, decision: "reject", reason: "" })
    ).resolves.toEqual({ error: "Invalid draft review." });
    expect(reviewDraft).not.toHaveBeenCalled();
  });

  test("returns unavailable when learning is disabled", async () => {
    learningEnabled.mockReturnValue(false);
    await expect(
      reviewKnowledgeDraft({ draftId: validId, decision: "approve_new" })
    ).resolves.toEqual({ error: "Not available." });
  });
});
