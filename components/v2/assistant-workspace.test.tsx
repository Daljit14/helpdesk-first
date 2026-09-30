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
  handleStart: vi.fn(),
  handleSubmitAnswer: vi.fn(),
  retry: vi.fn(),
  setProblem: vi.fn(),
  problem: "wifi keeps dropping",
  loading: false,
  error: null as string | null,
  currentOutput: {
    decision: "match" as string,
    matchedIssueSlug: "wifi-keeps-dropping" as string | undefined,
    explanation: "Try this approved guide." as string | undefined,
    diagnosticQuestionIds: [] as string[],
  } as {
    decision: string;
    matchedIssueSlug: string | undefined;
    explanation: string | undefined;
    diagnosticQuestionIds: string[];
  } | null,
  diagnosticAnswer: "",
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
    problem: mocks.problem,
    setProblem: mocks.setProblem,
    platform: "Mac",
    previousAnswers: [],
    currentOutput: mocks.currentOutput,
    loading: mocks.loading,
    error: mocks.error,
    started: true,
    diagnosticAnswer: mocks.diagnosticAnswer,
    setDiagnosticAnswer: vi.fn(),
    submitIntake: vi.fn(),
    handleStart: mocks.handleStart,
    handleSubmitPlatform: vi.fn(),
    handleSubmitAnswer: mocks.handleSubmitAnswer,
    handleRejectMatch: vi.fn(),
    handleSendToSupport: mocks.handleSendToSupport,
    retry: mocks.retry,
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
  mocks.handleStart.mockReset();
  mocks.handleSubmitAnswer.mockReset();
  mocks.retry.mockReset();
  mocks.setProblem.mockReset();
  mocks.problem = "wifi keeps dropping";
  mocks.loading = false;
  mocks.error = null;
  mocks.currentOutput = {
    decision: "match",
    matchedIssueSlug: "wifi-keeps-dropping",
    explanation: "Try this approved guide.",
    diagnosticQuestionIds: [],
  };
  mocks.diagnosticAnswer = "";
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
    expect(screen.getByText(/Outcome: Did not work/)).toBeInTheDocument();
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
      expect(screen.getByText("Outcome: Worked")).toBeInTheDocument();
      expect(
        screen.getByText("That step may have resolved the problem.")
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("heading", { name: "Sources" })
    ).toBeInTheDocument();
    expect(screen.getByText("Wi-Fi keeps dropping")).toBeInTheDocument();
  });

  it("renders requester turns and disables the composer while intake is pending", () => {
    mocks.loading = true;
    render(
      <AssistantWorkspace
        initialProblem="wifi keeps dropping"
        initialPlatform="Mac"
      />
    );

    expect(screen.getAllByText("wifi keeps dropping").length).toBeGreaterThan(
      0
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText("Describe your IT problem"), {
      key: "Enter",
    });
    expect(mocks.handleStart).not.toHaveBeenCalled();
  });

  it("shows only the thinking bubble while a clarification answer is pending", () => {
    mocks.loading = true;
    mocks.currentOutput = {
      decision: "clarify",
      matchedIssueSlug: undefined,
      explanation: undefined,
      diagnosticQuestionIds: ["which-platform"],
    };
    mocks.diagnosticAnswer = "Mac";
    render(<AssistantWorkspace initialProblem="wifi keeps dropping" />);

    expect(screen.getByText("Assistant is thinking…")).toBeInTheDocument();
    expect(
      screen.queryByText("What platform are you using?")
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Question \d of 3/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("keeps the entered text available when a request fails and retries it", () => {
    mocks.error = "The support assistant is not responding.";
    render(<AssistantWorkspace />);

    const input = screen.getByLabelText("Describe your IT problem");
    fireEvent.change(input, { target: { value: "wifi keeps dropping" } });
    expect(input).toHaveValue("wifi keeps dropping");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.retry).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("wifi keeps dropping");
  });

  it("answers a greeting warmly with example problems instead of matching", () => {
    mocks.currentOutput = null;
    mocks.problem = "hyyyyyyyyy";
    render(<AssistantWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.handleStart).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Hi there! I’m the HelpDesk First assistant/)
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Printer is offline" }).length
    ).toBeGreaterThan(0);
  });

  it("shows an alert for keyboard mashing and never sends it", () => {
    mocks.currentOutput = null;
    mocks.problem = "dikncjkdbcjb ajbdkajbd";
    render(<AssistantWorkspace />);

    expect(
      screen.getByText("That doesn’t look like a problem description yet.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.handleStart).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Hmm, I couldn’t understand that."
    );
    expect(mocks.setProblem).toHaveBeenCalledWith("");
  });

  it("warns about secrets, clears the input, and does not echo them", () => {
    mocks.currentOutput = null;
    mocks.problem = "my password is hunter2";
    render(<AssistantWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.handleStart).not.toHaveBeenCalled();
    expect(mocks.setProblem).toHaveBeenCalledWith("");
    expect(screen.getByRole("alert")).toHaveTextContent("Don’t share secrets");
    expect(screen.queryByText("You:")).not.toBeInTheDocument();
  });

  it("says when no approved guide fits and offers a person", () => {
    mocks.currentOutput = null;
    mocks.problem = "my office chair is broken";
    render(<AssistantWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.handleStart).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: "I couldn’t find an approved guide for this yet",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rephrase" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Talk to a person" })
    ).toHaveAttribute("href", expect.stringContaining("intent=human"));
  });

  it("sends a real IT problem and example chips through the pipeline", () => {
    mocks.currentOutput = null;
    mocks.problem = "prnter offline";
    render(<AssistantWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Printer is offline" }));
    expect(mocks.handleStart).toHaveBeenCalledWith("Printer is offline");
    mocks.handleStart.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(mocks.handleStart).toHaveBeenCalledWith("prnter offline");
  });
});
