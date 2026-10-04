import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { OutcomeFeedback } from "./outcome-feedback";

const { submitMock } = vi.hoisted(() => ({ submitMock: vi.fn() }));

vi.mock("@/app/actions/agent-feedback", () => ({
  submitAgentOutcomeFeedback: submitMock,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OutcomeFeedback", () => {
  test("expands, requires a verdict, and submits the selected feedback", async () => {
    submitMock.mockResolvedValue({ ok: true });
    render(<OutcomeFeedback sessionId="session-123" />);
    fireEvent.click(screen.getByRole("button", { name: "That wasn't right" }));
    expect(
      screen.getByRole("group", { name: "What happened?" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "It's still broken" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Anything else? (optional)" }),
      {
        target: { value: "It disconnects again." },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(submitMock).toHaveBeenCalledWith({
        sessionId: "session-123",
        verdict: "still_broken",
        text: "It disconnects again.",
      })
    );
    expect(
      await screen.findByText(
        "Thanks — this has been flagged for the support team."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Talk to a person" })
    ).toHaveAttribute("href", "/assistant?intent=human");
  });

  test("shows the duplicate-submission message", async () => {
    submitMock.mockResolvedValue({
      ok: false,
      error: "already_submitted",
    });
    render(<OutcomeFeedback sessionId="session-123" />);
    fireEvent.click(screen.getByRole("button", { name: "That wasn't right" }));
    fireEvent.click(screen.getByRole("radio", { name: "Something else" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(
      await screen.findByText("You've already sent feedback for this session.")
    ).toBeInTheDocument();
  });
});
