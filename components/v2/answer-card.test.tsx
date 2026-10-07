import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AnswerCard as AnswerCardData } from "@/lib/answers/present";
import { AnswerCard } from "./answer-card";

const baseCard: AnswerCardData = {
  runId: "run-1",
  outcome: "answer",
  likelyCause: {
    text: "A recent update may have affected startup.",
    sourceIds: ["official"],
  },
  explanations: [
    {
      text: "The application stores its settings locally.",
      sourceIds: ["ref"],
    },
  ],
  steps: [
    {
      kind: "official",
      text: "Restart the application.",
      sourceIds: ["official"],
    },
    {
      kind: "community_tip",
      text: "Clear the local cache.",
      sourceIds: ["community"],
    },
  ],
  withheldForIt: 0,
  sources: [
    {
      id: "official",
      title: "Application support",
      domain: "support.example.test",
      url: "https://support.example.test/help",
      label: "Official docs",
      attribution: null,
    },
    {
      id: "community",
      title: "Community discussion",
      domain: "community.example.test",
      url: "https://community.example.test/post/1",
      label: "Community post",
      attribution: "Community contributors",
    },
    {
      id: "ref",
      title: "Reference page",
      domain: "reference.example.test",
      url: "https://reference.example.test/article",
      label: "Reference",
      attribution: null,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AnswerCard", () => {
  test("renders official steps, separate community tips, references, and sources", () => {
    render(<AnswerCard card={baseCard} />);

    expect(
      screen.getByRole("heading", { name: "Here's what usually fixes this" })
    ).toBeInTheDocument();
    expect(screen.getByText("Official step")).toBeInTheDocument();
    expect(
      screen.getByText("Community tip — not official")
    ).toBeInTheDocument();
    expect(screen.getByText("Good to know")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Application support" })
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("link", { name: "Application support" })
    ).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });

  test("shows the needs-IT message and supplied handoff action", () => {
    render(
      <AnswerCard
        card={{
          ...baseCard,
          outcome: "needs_it",
          steps: [],
          withheldForIt: 1,
        }}
        handoff={<button type="button">Talk to a person</button>}
      />
    );

    expect(
      screen.getByRole("heading", { name: "I found a fix, but it needs IT" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Some steps need admin rights or security changes, so IT should do them."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Talk to a person" })
    ).toBeInTheDocument();
  });

  test("posts feedback and disables the controls after success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<AnswerCard card={baseCard} />);

    fireEvent.click(screen.getByRole("button", { name: "It helped" }));

    await screen.findByRole("status");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/answers/feedback",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ runId: "run-1", outcome: "helpful" }),
      })
    );
    expect(screen.getByRole("button", { name: "It helped" })).toBeDisabled();
  });

  test("shows feedback errors and hides feedback without a run id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<AnswerCard card={baseCard} />);
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't save that. Try again."
    );

    rerender(
      <AnswerCard
        card={{
          ...baseCard,
          runId: null,
        }}
      />
    );
    await waitFor(() => {
      expect(screen.queryByText("Did this help?")).not.toBeInTheDocument();
    });
  });
});
