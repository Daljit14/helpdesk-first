import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWorkflowTicket: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/app/actions/tickets", () => ({
  createWorkflowTicket: mocks.createWorkflowTicket,
}));
vi.mock("@/app/actions/resolution", () => ({
  startAiTicket: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

import { AiAssistant } from "./ai-assistant";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.createWorkflowTicket.mockReset();
  mocks.push.mockReset();
});

function mockEscalation(
  output: Record<string, unknown> = {
    status: "escalate",
    reason: "Contact your IT team",
  }
) {
  vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    if (String(input).includes("/api/analytics/event")) {
      return new Response("{}", { status: 204 });
    }
    return new Response(JSON.stringify(output), { status: 200 });
  });
}

describe("AiAssistant escalation", () => {
  test("creates a workflow ticket and routes signed-in users", async () => {
    mockEscalation();
    mocks.createWorkflowTicket.mockResolvedValue({
      success: true,
      ticketId: "ticket-123",
    });
    render(<AiAssistant workflowEnabled resolutionTrackingEnabled signedIn />);

    fireEvent.change(
      screen.getByLabelText("What problem are you experiencing?"),
      {
        target: { value: "I think my account was hacked" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByRole("button", { name: "Send to a support person" })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Send to a support person" })
    );
    await vi.waitFor(() => {
      expect(mocks.createWorkflowTicket).toHaveBeenCalledWith({
        message: "I think my account was hacked",
        platform: "Other",
        diagnosticAnswers: [],
      });
      expect(mocks.push).toHaveBeenCalledWith("/tickets/ticket-123");
    });
  });

  test("offers a login link for signed-out users", async () => {
    mockEscalation();
    render(<AiAssistant workflowEnabled />);
    fireEvent.change(
      screen.getByLabelText("What problem are you experiencing?"),
      {
        target: { value: "I think my account was hacked" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByRole("link", {
        name: "Log in to send this to a support person",
      })
    ).toHaveAttribute("href", "/login?next=/assistant");
  });

  test("renders grounded suggestions for an escalation", async () => {
    mockEscalation({
      status: "ok",
      output: {
        decision: "escalate",
        escalationReason: "I could not find one clear match.",
        suggestedIssueSlugs: ["slow-computer"],
      },
    });
    render(<AiAssistant />);
    fireEvent.change(
      screen.getByLabelText("What problem are you experiencing?"),
      { target: { value: "my computer is very slow and freezes" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Here's what I found")).toBeInTheDocument();
    expect(screen.getByText("Suggested guides")).toBeInTheDocument();
    expect(screen.getByText("Slow computer")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open full guide" })
    ).toHaveAttribute("href", "/issues/slow-computer/guide");
  });
});
