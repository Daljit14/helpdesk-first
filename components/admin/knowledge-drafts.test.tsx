import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { KnowledgeDrafts } from "./knowledge-drafts";

const { review, split } = vi.hoisted(() => ({
  review: vi.fn(),
  split: vi.fn(),
}));
vi.mock("@/app/actions/knowledge", () => ({
  reviewKnowledgeDraft: review,
  splitKnowledgeDraft: split,
}));

const draft = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "org-1",
  ticketId: "22222222-2222-4222-8222-222222222222",
  kind: "new_guide" as const,
  relatedSlug: null,
  title: "New guide: Network issue",
  content: {
    symptoms: ["No connection"],
    rootCause: "The adapter was disabled.",
    resolutionSteps: ["Enable the adapter."],
    preventive: null,
    toolsUsed: "Network settings",
    platform: "Windows",
    attemptedGuide: null,
  },
  article: {
    title: "Network issue",
    problemSummary: "The wireless connection drops.",
    symptoms: ["No connection"],
    platforms: ["Windows"],
    rootCause: "The adapter was disabled.",
    preconditions: [],
    steps: [{ text: "Enable the adapter.", risk: "safe" as const }],
    verification: ["Reconnect to Wi-Fi."],
    escalationConditions: ["The issue returns."],
    prevention: ["Keep drivers updated."],
    sources: [{ type: "guide" as const, reference: "no-internet" }],
    confidence: 0.8,
    securityReviewRequired: false,
  },
  confirmation: "user_confirmed" as const,
  status: "draft" as const,
  reviewNote: null,
  rejectionReason: null,
  reviewerInstructions: null,
  regenerationCount: 0,
  securityReviewRequired: false,
  failureReason: null,
  redactionSummary: {},
  similarSlugs: [],
  modelProvider: "deterministic",
  modelVersion: "1",
  promptVersion: "learned-article-v1",
  generatedAt: "2026-01-01T00:00:00Z",
  reviewedBy: null,
  reviewedAt: null,
  createdGuideId: null,
  publishedRevisionId: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  clusterId: null,
  sourceKind: "ticket" as const,
  agentSessionId: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("KnowledgeDrafts", () => {
  test("renders gap count and hides review buttons when read-only", () => {
    render(<KnowledgeDrafts drafts={[draft]} canWrite={false} />);
    expect(
      screen.getByText(/1 awaiting review · 1 knowledge gaps/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve as new guide" })
    ).toBeNull();
  });

  test("approves a draft", async () => {
    review.mockResolvedValue({ success: true });
    render(<KnowledgeDrafts drafts={[draft]} canWrite />);
    fireEvent.click(
      screen.getByRole("button", { name: "Approve as new guide" })
    );
    await vi.waitFor(() =>
      expect(review).toHaveBeenCalledWith({
        draftId: draft.id,
        decision: "approve_new",
      })
    );
  });

  test("rejects a draft with a required reason", async () => {
    review.mockResolvedValue({ success: true });
    render(<KnowledgeDrafts drafts={[draft]} canWrite />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const reason = screen.getByRole("textbox", { name: /rejection reason/i });
    fireEvent.change(reason, {
      target: { value: "Contains unsafe guidance." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    await vi.waitFor(() =>
      expect(review).toHaveBeenCalledWith({
        draftId: draft.id,
        decision: "reject",
        reason: "Contains unsafe guidance.",
      })
    );
  });

  test("groups cluster sources, summarizes the primary and splits a member", async () => {
    split.mockResolvedValue({ success: true });
    const primary = { ...draft, clusterId: "cluster-1" };
    const member = {
      ...draft,
      id: "33333333-3333-4333-8333-333333333333",
      title: "Another network candidate",
      status: "clustered" as const,
      clusterId: "cluster-1",
      sourceKind: "agent_session" as const,
    };
    render(
      <KnowledgeDrafts
        drafts={[member, primary]}
        canWrite
        captureEnabled
        clusters={[
          {
            id: "cluster-1",
            organizationId: "org-1",
            clusterKey: "key-1",
            platform: "Windows",
            title: "Network issue",
            tokens: ["network"],
            memberCount: 2,
            answerFixedCount: 1,
            primaryDraftId: primary.id,
            status: "open",
            lastSeenAt: "2026-01-02T00:00:00Z",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ]}
      />
    );
    expect(screen.getByText(/Cluster: 2 candidates/)).toBeInTheDocument();
    expect(
      screen.getAllByText("Sources: ticket 1 · agent 1 · answer 0")
    ).toHaveLength(2);
    expect(screen.getByText("Privacy: Nothing removed.")).toBeInTheDocument();
    expect(screen.getByText("Open clusters: 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Split" }));
    await vi.waitFor(() =>
      expect(split).toHaveBeenCalledWith({ draftId: member.id })
    );
  });
});
