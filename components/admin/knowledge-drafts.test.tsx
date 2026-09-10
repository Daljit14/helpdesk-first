import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { KnowledgeDrafts } from "./knowledge-drafts";

const { review } = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock("@/app/actions/knowledge", () => ({
  reviewKnowledgeDraft: review,
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
  confirmation: "user_confirmed" as const,
  status: "draft" as const,
  reviewNote: null,
  reviewedBy: null,
  reviewedAt: null,
  createdGuideId: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
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
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  test("approves a draft with its note", async () => {
    review.mockResolvedValue({ success: true });
    render(<KnowledgeDrafts drafts={[draft]} canWrite />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Approved after review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await vi.waitFor(() =>
      expect(review).toHaveBeenCalledWith({
        draftId: draft.id,
        status: "approved",
        note: "Approved after review",
      })
    );
  });
});
