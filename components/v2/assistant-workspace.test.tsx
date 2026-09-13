import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantWorkspace } from "./assistant-workspace";

const mocks = vi.hoisted(() => ({
  handleSendToSupport: vi.fn(),
  recordStepOutcome: vi.fn(),
  startAiTicket: vi.fn(),
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

vi.mock("@/app/actions/tickets", () => ({
  recordStepOutcome: mocks.recordStepOutcome,
}));

vi.mock("@/lib/search", () => ({
  getIssueBySlug: () => ({
    id: "wifi-keeps-dropping",
    title: "Wi-Fi keeps dropping",
    risk: "low",
  }),
}));

vi.mock("@/lib/investigation/policy", () => ({
  getIssueStepPolicies: () => [
    { stepIndex: 0, text: "Restart the network adapter", risk: "low" },
  ],
  isOfferable: () => true,
  riskLabel: () => "Low risk",
}));

vi.mock("@/components/ai-assistant-logic", () => ({
  useAssistantIntake: () => ({
    problem: "wifi keeps dropping",
    setProblem: vi.fn(),
    platform: "Mac",
    previousAnswers: [],
    currentOutput: {
      decision: "match",
      matchedIssueSlug: "wifi-keeps-dropping",
      explanation: "Try this approved guide.",
    },
    loading: false,
    error: null,
    started: true,
    diagnosticAnswer: "",
    setDiagnosticAnswer: vi.fn(),
    submitIntake: vi.fn(),
    handleStart: vi.fn(),
    handleSubmitPlatform: vi.fn(),
    handleSubmitAnswer: vi.fn(),
    handleRejectMatch: vi.fn(),
    handleSendToSupport: mocks.handleSendToSupport,
    searchHref: () => "/browse",
    startAiTicket: mocks.startAiTicket,
    router: { push: vi.fn() },
  }),
}));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  mocks.handleSendToSupport.mockReset();
  mocks.recordStepOutcome.mockReset();
  mocks.startAiTicket.mockReset();
});

describe("AssistantWorkspace", () => {
  it("records a failed outcome, persists it, and moves the step into Already tried", async () => {
    mocks.recordStepOutcome.mockResolvedValue({ success: true });
    render(
      <AssistantWorkspace
        initialProblem="wifi keeps dropping"
        initialPlatform="Mac"
        autoStart
      />
    );

    expect(screen.getByText("Restart the network adapter")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Did not work" }));

    await waitFor(() => {
      expect(screen.queryByText("Suggested steps")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Already tried")).toBeInTheDocument();
    expect(screen.getByText(/Outcome: failed/)).toBeInTheDocument();
    expect(
      JSON.parse(sessionStorage.getItem("hf-v2-outcomes") ?? "{}")
    ).toEqual({
      "wifi-keeps-dropping:0": "failed",
    });
  });

  it("renders support action errors and re-enables the action", async () => {
    mocks.handleSendToSupport.mockResolvedValue({
      error: "Unable to submit ticket.",
    });
    render(
      <AssistantWorkspace
        initialProblem="wifi keeps dropping"
        initialPlatform="Mac"
        intent="ticket"
        workflowEnabled
        signedIn
      />
    );

    const button = screen.getByRole("button", {
      name: "Send to a support person",
    });
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Unable to submit ticket."
      );
      expect(button).not.toBeDisabled();
    });
  });

  it("keeps a worked step visible with its outcome and resolution message", async () => {
    render(
      <AssistantWorkspace
        initialProblem="wifi keeps dropping"
        initialPlatform="Mac"
        autoStart
      />
    );

    const worked = screen.getByRole("button", { name: "Worked" });
    fireEvent.click(worked);

    await waitFor(() => {
      expect(worked).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("Outcome: worked")).toBeInTheDocument();
      expect(
        screen.getByText("That step may have resolved the problem.")
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Sources" })
    ).toBeInTheDocument();
    expect(screen.getByText("Wi-Fi keeps dropping")).toBeInTheDocument();
  });
});
