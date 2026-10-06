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
