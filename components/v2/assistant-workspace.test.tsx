import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ANSWER_LENGTH,
  MAX_CUMULATIVE_TEXT_LENGTH,
  MAX_MESSAGE_LENGTH,
} from "@/lib/ai/validation";
import { diagnosticQuestions } from "@/lib/ai/types";
import { AssistantWorkspace } from "./assistant-workspace";

const platformQuestionText = diagnosticQuestions.find(
  (question) => question.id === "which-platform"
)!.text;

const mocks = vi.hoisted(() => ({
  handleSendToSupport: vi.fn(),
  recordStepOutcome: vi.fn(),
  startAiTicket: vi.fn(),
  handleStart: vi.fn(),
  handleSubmitAnswer: vi.fn(),
  retry: vi.fn(),
  setProblem: vi.fn(),
  setDiagnosticAnswer: vi.fn(),
  problem: "wifi keeps dropping",
  platform: "Mac" as "Mac" | "Windows" | null,
  previousAnswers: [] as { questionId: string; answer: string }[],
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
    platform: mocks.platform,
    previousAnswers: mocks.previousAnswers,
    currentOutput: mocks.currentOutput,
    loading: mocks.loading,
    error: mocks.error,
    started: true,
    diagnosticAnswer: mocks.diagnosticAnswer,
    setDiagnosticAnswer: mocks.setDiagnosticAnswer,
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
  mocks.setDiagnosticAnswer.mockReset();
  mocks.problem = "wifi keeps dropping";
  mocks.platform = "Mac";
  mocks.previousAnswers = [];
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
    await waitFor(() => {
      expect(
        JSON.parse(sessionStorage.getItem("hf-v2-outcomes") ?? "{}")
      ).toEqual({
        scope: "wifi keeps dropping",
        outcomes: { "wifi-keeps-dropping:0": "failed" },
      });
    });
  });

  it("does not restore outcomes from a different conversation", async () => {
    sessionStorage.setItem(
      "hf-v2-outcomes",
      JSON.stringify({
        scope: "printer is offline",
        outcomes: { "wifi-keeps-dropping:0": "failed" },
      })
    );
    render(
      <AssistantWorkspace
        initialProblem="wifi keeps dropping"
        initialPlatform="Mac"
        autoStart
      />
    );

    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });
    expect(screen.getByText("Suggested steps")).toBeInTheDocument();
    expect(screen.getByText("Restart the network adapter")).toBeInTheDocument();
    expect(screen.queryByText("Already tried")).not.toBeInTheDocument();
  });

  it("ignores legacy flat outcome storage", async () => {
    sessionStorage.setItem(
      "hf-v2-outcomes",
      JSON.stringify({ "wifi-keeps-dropping:0": "failed" })
    );
    render(
      <AssistantWorkspace
        initialProblem="wifi keeps dropping"
        initialPlatform="Mac"
        autoStart
      />
    );

    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });
    expect(screen.getByText("Suggested steps")).toBeInTheDocument();
    expect(screen.getByText("Restart the network adapter")).toBeInTheDocument();
    expect(screen.queryByText("Already tried")).not.toBeInTheDocument();
  });

  it("restores outcomes for the same deep-linked conversation", async () => {
    sessionStorage.setItem(
      "hf-v2-outcomes",
      JSON.stringify({
        scope: "wifi keeps dropping",
        outcomes: { "wifi-keeps-dropping:0": "failed" },
      })
    );
    render(
      <AssistantWorkspace
        initialProblem="wifi keeps dropping"
        initialPlatform="Mac"
        autoStart
      />
    );

    expect(await screen.findByText("Already tried")).toBeInTheDocument();
    expect(screen.queryByText("Suggested steps")).not.toBeInTheDocument();
    expect(screen.getByText(/Outcome: Did not work/)).toBeInTheDocument();
  });

  it("clears outcomes when starting a new intake in the same chat", async () => {
    mocks.recordStepOutcome.mockResolvedValue({ success: true });
    const props = {
      initialProblem: "wifi keeps dropping",
      initialPlatform: "Mac" as const,
      autoStart: true,
    };
    const { rerender } = render(<AssistantWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Did not work" }));

    await waitFor(() => {
      expect(
        JSON.parse(sessionStorage.getItem("hf-v2-outcomes") ?? "{}")
      ).toEqual({
        scope: "wifi keeps dropping",
        outcomes: { "wifi-keeps-dropping:0": "failed" },
      });
    });

    mocks.setProblem.mockImplementation((value: string) => {
      mocks.problem = value;
    });
    fireEvent.change(screen.getByLabelText("Describe your IT problem"), {
      target: { value: " wifi keeps dropping " },
    });
    rerender(<AssistantWorkspace {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.handleStart).toHaveBeenCalledWith("wifi keeps dropping");
    await waitFor(() => {
      expect(screen.getByText("Suggested steps")).toBeInTheDocument();
      expect(
        screen.getByText("Restart the network adapter")
      ).toBeInTheDocument();
      expect(screen.queryByText("Already tried")).not.toBeInTheDocument();
      expect(
        JSON.parse(sessionStorage.getItem("hf-v2-outcomes") ?? "{}")
      ).toEqual({
        scope: "wifi keeps dropping",
        outcomes: {},
      });
    });
  });

  it("hydrates before restoring persisted outcomes", async () => {
    sessionStorage.removeItem("hf-v2-outcomes");
    const element = (
      <AssistantWorkspace
        initialProblem="wifi keeps dropping"
        initialPlatform="Mac"
        autoStart
      />
    );
    const serverHtml = renderToString(element);
    expect(serverHtml).toContain("Suggested steps");
    expect(serverHtml).not.toContain("Already tried");

    sessionStorage.setItem(
      "hf-v2-outcomes",
      JSON.stringify({
        scope: "wifi keeps dropping",
        outcomes: { "wifi-keeps-dropping:0": "failed" },
      })
    );
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | null = null;

    try {
      await act(async () => {
        root = hydrateRoot(container, element);
      });
      await waitFor(() =>
        expect(within(container).getByText("Already tried")).toBeInTheDocument()
      );
      expect(
        consoleError.mock.calls
          .map((args) => args.map(String).join(" "))
          .filter((message) =>
            /hydration|did not match|server rendered HTML/i.test(message)
          )
      ).toEqual([]);
    } finally {
      if (root) await act(async () => root?.unmount());
      consoleError.mockRestore();
      container.remove();
    }
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

  it("disables blank sends without disabling the textarea or submitting on Enter", () => {
    mocks.problem = "";
    mocks.currentOutput = null;
    const { rerender } = render(<AssistantWorkspace />);

    const input = screen.getByLabelText("Describe your IT problem");
    expect(input).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mocks.handleStart).not.toHaveBeenCalled();
    expect(mocks.handleSubmitAnswer).not.toHaveBeenCalled();

    mocks.problem = "wifi keeps dropping";
    mocks.currentOutput = {
      decision: "clarify",
      matchedIssueSlug: undefined,
      explanation: undefined,
      diagnosticQuestionIds: ["which-platform"],
    };
    rerender(<AssistantWorkspace initialProblem="wifi keeps dropping" />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.handleSubmitAnswer).not.toHaveBeenCalled();
  });

  it("blocks an overlong problem without sending it", () => {
    mocks.currentOutput = null;
    mocks.problem = "w".repeat(MAX_MESSAGE_LENGTH + 1);
    render(<AssistantWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.handleStart).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue(mocks.problem);
    expect(
      screen.getByText(
        "That's a lot of detail. Please describe the problem in under 1,000 characters."
      )
    ).toBeInTheDocument();
  });

  it("keeps an overlong answer in the field without adding a user turn", () => {
    mocks.currentOutput = {
      decision: "clarify",
      matchedIssueSlug: undefined,
      explanation: undefined,
      diagnosticQuestionIds: ["which-platform"],
    };
    mocks.diagnosticAnswer = "a".repeat(MAX_ANSWER_LENGTH + 1);
    render(<AssistantWorkspace initialProblem="wifi keeps dropping" />);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.handleSubmitAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue(mocks.diagnosticAnswer);
    expect(
      screen.getByText(
        "That answer is too long. Please keep it under 500 characters."
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText("wifi keeps dropping")).toHaveLength(1);
  });

  it("blocks answers that exceed the cumulative text limit", () => {
    mocks.problem = "p".repeat(MAX_CUMULATIVE_TEXT_LENGTH / 2);
    mocks.previousAnswers = [
      { questionId: "which-platform", answer: "a".repeat(500) },
      { questionId: "where-happens", answer: "b".repeat(500) },
    ];
    mocks.currentOutput = {
      decision: "clarify",
      matchedIssueSlug: undefined,
      explanation: undefined,
      diagnosticQuestionIds: ["when-started"],
    };
    mocks.diagnosticAnswer = "c";
    render(<AssistantWorkspace initialProblem={mocks.problem} />);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.handleSubmitAnswer).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("c");
    expect(
      screen.getByText(
        "That answer is too long. Please keep it under 500 characters."
      )
    ).toBeInTheDocument();
  });

  it("shows a clarification only once while an answer is loading", async () => {
    mocks.currentOutput = {
      decision: "clarify",
      matchedIssueSlug: undefined,
      explanation: undefined,
      diagnosticQuestionIds: ["which-platform"],
    };
    mocks.diagnosticAnswer = "Windows";
    const props = { initialProblem: "wifi keeps dropping" };
    const { rerender } = render(<AssistantWorkspace {...props} />);

    expect(await screen.findByText(platformQuestionText)).toBeInTheDocument();
    expect(screen.getAllByText(platformQuestionText)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    mocks.loading = true;
    mocks.previousAnswers = [
      { questionId: "which-platform", answer: "Windows" },
    ];
    rerender(<AssistantWorkspace {...props} />);
    expect(screen.queryByText(platformQuestionText)).not.toBeInTheDocument();

    mocks.loading = false;
    mocks.currentOutput = {
      decision: "match",
      matchedIssueSlug: "wifi-keeps-dropping",
      explanation: "The result is ready.",
      diagnosticQuestionIds: [],
    };
    rerender(<AssistantWorkspace {...props} />);

    expect(screen.getAllByText(platformQuestionText)).toHaveLength(1);
    expect(screen.getByText("The result is ready.")).toBeInTheDocument();
    expect(
      screen
        .getByText(platformQuestionText)
        .compareDocumentPosition(screen.getByText("The result is ready.")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("does not append another clarification after an answer fails", async () => {
    mocks.currentOutput = {
      decision: "clarify",
      matchedIssueSlug: undefined,
      explanation: undefined,
      diagnosticQuestionIds: ["which-platform"],
    };
    mocks.diagnosticAnswer = "Windows";
    const props = { initialProblem: "wifi keeps dropping" };
    const { rerender } = render(<AssistantWorkspace {...props} />);

    expect(await screen.findByText(platformQuestionText)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    mocks.loading = true;
    mocks.previousAnswers = [
      { questionId: "which-platform", answer: "Windows" },
    ];
    rerender(<AssistantWorkspace {...props} />);

    mocks.loading = false;
    mocks.error = "The support assistant is not responding.";
    rerender(<AssistantWorkspace {...props} />);

    expect(screen.getAllByText(platformQuestionText)).toHaveLength(1);
  });

  it("returns focus to the composer after a chip intake finishes", () => {
    mocks.currentOutput = null;
    const { rerender } = render(<AssistantWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Printer is offline" }));
    mocks.loading = true;
    rerender(<AssistantWorkspace />);
    mocks.loading = false;
    rerender(<AssistantWorkspace />);

    expect(screen.getByLabelText("Describe your IT problem")).toHaveFocus();
  });

  it("returns to the Understanding step after a network error", () => {
    mocks.currentOutput = null;
    mocks.error = "The support assistant is not responding.";
    render(<AssistantWorkspace initialProblem="wifi keeps dropping" />);

    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent(
      "Understanding"
    );
  });

  it("keeps a clarification output on the Clarifying step when an error is shown", () => {
    mocks.currentOutput = {
      decision: "clarify",
      matchedIssueSlug: undefined,
      explanation: undefined,
      diagnosticQuestionIds: ["which-platform"],
    };
    mocks.error = "The support assistant is not responding.";
    render(<AssistantWorkspace initialProblem="wifi keeps dropping" />);

    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent(
      "Clarifying"
    );
  });

  it("hides inactive stepper labels below the small breakpoint", () => {
    render(<AssistantWorkspace />);

    const listItems = screen.getAllByRole("listitem");
    listItems.forEach((item, index) => {
      const label = item.querySelectorAll("span")[1];
      expect(label).toBeDefined();
      if (index === 3) {
        expect(label).not.toHaveClass("hidden");
      } else {
        expect(label).toHaveClass("hidden", "sm:block");
      }
    });
  });

  it("disables person and escalation sends while intake is loading", () => {
    mocks.loading = true;
    mocks.currentOutput = {
      decision: "escalate",
      matchedIssueSlug: undefined,
      explanation: "Please contact support.",
      diagnosticQuestionIds: [],
    };
    const { rerender } = render(
      <AssistantWorkspace workflowEnabled signedIn />
    );

    expect(
      screen.getByRole("button", { name: "I want a person" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Send to a support person" })
    ).toBeDisabled();

    rerender(
      <AssistantWorkspace
        initialProblem="wifi keeps dropping"
        intent="human"
        workflowEnabled
        signedIn
      />
    );
    expect(
      screen.getByRole("button", { name: "Send to a support person" })
    ).toBeDisabled();
  });

  it("wraps escalation controls inside narrow cards", () => {
    mocks.currentOutput = {
      decision: "escalate",
      matchedIssueSlug: undefined,
      explanation: "Please contact support.",
      diagnosticQuestionIds: [],
    };
    const { unmount } = render(<AssistantWorkspace workflowEnabled signedIn />);
    expect(
      screen.getByRole("button", { name: "Send to a support person" })
    ).toHaveClass("h-auto", "max-w-full", "whitespace-normal");
    unmount();

    render(<AssistantWorkspace workflowEnabled />);
    expect(
      screen.getByRole("link", {
        name: "Log in to send this to a support person",
      })
    ).toHaveClass("h-auto", "max-w-full", "whitespace-normal");
  });

  it("wraps ticket-intent send controls inside narrow cards", () => {
    const { unmount } = render(
      <AssistantWorkspace
        initialProblem="wifi keeps dropping"
        intent="human"
        workflowEnabled
        signedIn
      />
    );
    expect(
      screen.getByRole("button", { name: "Send to a support person" })
    ).toHaveClass("h-auto", "max-w-full", "whitespace-normal");
    unmount();

    render(
      <AssistantWorkspace
        initialProblem="wifi keeps dropping"
        intent="human"
        workflowEnabled
      />
    );
    expect(
      screen.getByRole("link", {
        name: "Log in to send this to a support person",
      })
    ).toHaveClass("h-auto", "max-w-full", "whitespace-normal");
  });

  it("shows normal chat when human intent has no problem", () => {
    mocks.problem = "";
    mocks.currentOutput = null;
    render(<AssistantWorkspace intent="human" workflowEnabled signedIn />);

    expect(
      screen.getByText(
        "Describe your IT problem below and I’ll help find an approved guide."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Send this problem to your IT team",
      })
    ).not.toBeInTheDocument();
  });

  it("does not send a blank person request and focuses the composer", () => {
    mocks.problem = "";
    mocks.currentOutput = null;
    render(<AssistantWorkspace intent="human" workflowEnabled signedIn />);

    fireEvent.click(screen.getByRole("button", { name: "I want a person" }));

    expect(mocks.handleSendToSupport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Describe your problem first, then send it to a person."
    );
    expect(screen.getByLabelText("Describe your IT problem")).toHaveFocus();
  });

  it("clears the blank-person error when a problem is submitted", () => {
    mocks.problem = "";
    mocks.currentOutput = null;
    const props = { intent: "human", workflowEnabled: true, signedIn: true };
    const { rerender } = render(<AssistantWorkspace {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "I want a person" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Describe your problem first, then send it to a person."
    );

    mocks.problem = "wifi keeps dropping";
    rerender(<AssistantWorkspace {...props} />);
    expect(screen.getByRole("textbox")).toHaveValue("wifi keeps dropping");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.handleStart).toHaveBeenCalledWith("wifi keeps dropping");
  });

  it("keeps human intent and the problem in the signed-out login return URL", () => {
    mocks.problem = "My printer will not print";
    render(<AssistantWorkspace intent="" workflowEnabled />);

    const href = screen
      .getByRole("link", { name: "I want a person" })
      .getAttribute("href");
    const next = new URL(href ?? "", "http://localhost").searchParams.get(
      "next"
    );
    const nextUrl = new URL(next ?? "", "http://localhost");

    expect(nextUrl.pathname).toBe("/assistant");
    expect(nextUrl.searchParams.get("intent")).toBe("human");
    expect(nextUrl.searchParams.get("q")).toBe("My printer will not print");
  });

  it("shows the send-to-IT card for signed-in human intent with a problem", () => {
    render(
      <AssistantWorkspace
        initialProblem="My printer will not print"
        intent="human"
        workflowEnabled
        signedIn
      />
    );

    expect(
      screen.getByRole("heading", {
        name: "Send this problem to your IT team",
      })
    ).toBeInTheDocument();
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
    expect(screen.queryByText(platformQuestionText)).not.toBeInTheDocument();
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

  it("shows the no-match card for a household appliance", () => {
    mocks.currentOutput = null;
    mocks.problem = "my smart fridge display flickers";
    render(<AssistantWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(mocks.handleStart).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: "I couldn’t find an approved guide for this yet",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /external monitor not detected/i })
    ).toBeInTheDocument();
  });

  it("does not put a typed secret in the logged-out handoff link", () => {
    mocks.currentOutput = null;
    mocks.problem = "my password is Hunter2!23";
    render(<AssistantWorkspace workflowEnabled />);

    const href = screen
      .getByRole("link", { name: "I want a person" })
      .getAttribute("href");

    expect(href).not.toContain("Hunter2");
    expect(decodeURIComponent(href ?? "")).not.toContain("q=");
  });

  it("blocks a typed secret before creating a support ticket", () => {
    mocks.problem = "my password is Hunter2!23";
    render(<AssistantWorkspace workflowEnabled signedIn />);

    fireEvent.click(screen.getByRole("button", { name: "I want a person" }));

    expect(mocks.handleSendToSupport).not.toHaveBeenCalled();
    expect(mocks.setProblem).toHaveBeenCalledWith("");
    expect(screen.getByRole("alert")).toHaveTextContent("Don’t share secrets");
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
