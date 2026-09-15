import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reviewShadowDecision: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/actions/admin-shadow", () => ({
  reviewShadowDecision: mocks.reviewShadowDecision,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { ShadowReviewForm } from "./shadow-review-form";

describe("ShadowReviewForm", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("renders an error message from the review action", async () => {
    mocks.reviewShadowDecision.mockResolvedValue({
      error: "Review could not be saved.",
    });
    render(
      <ShadowReviewForm
        id="shadow-1"
        reviewStatus="unreviewed"
        reviewNote={null}
        canReview
      />
    );
    const form = screen.getByRole("button", { name: "Save" }).closest("form");
    if (!form) throw new Error("Review form not found.");
    fireEvent.submit(form);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Review could not be saved."
      )
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  test("renders read-only status and note for non-admins", () => {
    render(
      <ShadowReviewForm
        id="shadow-1"
        reviewStatus="unsafe"
        reviewNote="Needs review"
        canReview={false}
      />
    );
    expect(screen.getByText("Review: unsafe")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(
      screen.getByText("Organization admin required to review.")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
  });
});
