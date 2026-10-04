import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { OutcomeFeedbackPanel } from "./outcome-feedback-panel";

afterEach(cleanup);

describe("OutcomeFeedbackPanel", () => {
  test("shows an empty state when there is no feedback", () => {
    render(<OutcomeFeedbackPanel items={[]} total={0} />);
    expect(screen.getByText("No requester feedback yet")).toBeInTheDocument();
  });

  test("renders verdicts and feedback as plain text", () => {
    const text = '<img onerror="alert(1)">';
    render(
      <OutcomeFeedbackPanel
        total={1}
        items={[
          {
            sessionId: "session-12345678",
            verdict: "wrong_problem",
            createdAt: "2026-09-29T12:00:00.000Z",
            text,
          },
        ]}
      />
    );
    expect(screen.getByText("Misunderstood the problem")).toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("Session session-")).toBeInTheDocument();
  });
});
