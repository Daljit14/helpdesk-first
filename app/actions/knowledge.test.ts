import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  transitionKnowledgeGuide,
  updateKnowledgeGuideMetadata,
} from "./knowledge";

const {
  getAdminSession,
  recordAudit,
  governanceEnabled,
  transitionGuide,
  updateGuideMetadata,
} = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  recordAudit: vi.fn(),
  governanceEnabled: vi.fn(),
  transitionGuide: vi.fn(),
  updateGuideMetadata: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ getAdminSession, recordAudit }));
vi.mock("@/lib/admin/flags", () => ({
  isKnowledgeGovernanceEnabled: governanceEnabled,
}));
vi.mock("@/lib/knowledge/governance", () => ({
  transitionGuide,
  updateGuideMetadata,
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
});
