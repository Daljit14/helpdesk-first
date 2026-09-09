import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { TroubleshootingGuide } from "./troubleshooting-guide";
import { ISSUES } from "@/lib/issues";
import { getIssueSteps } from "@/lib/steps";
import { clearAllSessions } from "@/lib/session";
import { getIssueStepPolicies } from "@/lib/investigation/policy";

const issue = ISSUES.find((i) => i.id === "no-sound")!;
const steps = getIssueSteps(issue);

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("platform=Windows"),
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("TroubleshootingGuide", () => {
  beforeEach(() => {
    clearAllSessions();
  });

  afterEach(() => {
    cleanup();
  });

  test("renders the first step and progress", async () => {
    render(<TroubleshootingGuide issue={issue} />);
    await waitFor(() => {
      expect(screen.getByTestId("step-count")).toHaveTextContent(/Step 1 of 5/);
    });
    expect(screen.getByTestId("step-title")).toHaveTextContent(steps[0]);
  });

  test("completing steps advances and marks resolved at the final step", async () => {
    render(<TroubleshootingGuide issue={issue} />);
    await waitFor(() =>
      expect(screen.getByTestId("step-count")).toHaveTextContent(/Step 1 of 5/)
    );

    for (let i = 0; i < steps.length; i++) {
      expect(screen.getByTestId("step-count")).toHaveTextContent(
        `Step ${i + 1} of ${steps.length}`
      );
      fireEvent.click(
        screen.getByRole("button", { name: "I completed this step" })
      );
      if (i < steps.length - 1) {
        await waitFor(() =>
          expect(screen.getByTestId("step-count")).toHaveTextContent(
            `Step ${i + 2} of ${steps.length}`
          )
        );
      }
    }

    await waitFor(() => {
      expect(screen.getByTestId("guide-status")).toHaveTextContent(
        "Problem solved"
      );
    });
    expect(screen.getByRole("button", { name: "Yes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No" })).toBeInTheDocument();
  });

  test("'This did not work' on the final step escalates", async () => {
    render(<TroubleshootingGuide issue={issue} />);
    await waitFor(() =>
      expect(screen.getByTestId("step-count")).toHaveTextContent(/Step 1 of 5/)
    );

    for (let i = 0; i < steps.length - 1; i++) {
      fireEvent.click(
        screen.getByRole("button", { name: "I completed this step" })
      );
      await waitFor(() =>
        expect(screen.getByTestId("step-count")).toHaveTextContent(
          `Step ${i + 2} of ${steps.length}`
        )
      );
    }

    fireEvent.click(screen.getByRole("button", { name: "This did not work" }));
    await waitFor(() => {
      expect(screen.getByTestId("guide-status")).toHaveTextContent(
        "This problem is unresolved"
      );
    });
  });

  test("escalation can generate a report", async () => {
    render(<TroubleshootingGuide issue={issue} />);
    await waitFor(() =>
      expect(screen.getByTestId("step-count")).toHaveTextContent(/Step 1 of 5/)
    );

    fireEvent.click(
      screen.getByRole("button", { name: "I cannot complete this step" })
    );
    await waitFor(() =>
      expect(screen.getByTestId("guide-status")).toHaveTextContent(
        "This problem is unresolved"
      )
    );

    fireEvent.change(screen.getByLabelText(/Why could you not resolve/), {
      target: { value: "I do not have admin rights" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

    await waitFor(() => {
      expect(screen.getByText(/Attempted steps:/)).toBeInTheDocument();
    });
    expect(screen.getByText(/I do not have admin rights/)).toBeInTheDocument();
  });

  test("restart resets the guide", async () => {
    render(<TroubleshootingGuide issue={issue} />);
    await waitFor(() =>
      expect(screen.getByTestId("step-count")).toHaveTextContent(/Step 1 of 5/)
    );

    fireEvent.click(screen.getByRole("button", { name: "Problem solved" }));
    await waitFor(() =>
      expect(screen.getByTestId("guide-status")).toHaveTextContent(
        "Problem solved"
      )
    );

    fireEvent.click(screen.getByRole("button", { name: /Restart the guide/ }));
    await waitFor(() => {
      expect(screen.getByTestId("step-count")).toHaveTextContent(/Step 1 of 5/);
    });
  });

  test("caution steps require local confirmation before outcomes", async () => {
    const cautionIssue = ISSUES.find((item) => item.id === "low-storage")!;
    render(
      <TroubleshootingGuide
        issue={cautionIssue}
        stepPolicies={getIssueStepPolicies(cautionIssue)}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId("step-count")).toHaveTextContent(/Step 1 of/)
    );
    fireEvent.click(
      screen.getByRole("button", { name: "I completed this step" })
    );
    await waitFor(() =>
      expect(screen.getByText("Confirm first")).toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: "This did not work" })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "I understand, continue" })
    );
    expect(
      screen.getByRole("button", { name: "This did not work" })
    ).toBeInTheDocument();
  });

  test("approval steps show the approval label without outcome buttons", async () => {
    const approvalIssue = ISSUES.find((item) => item.id === "no-sound")!;
    const policies = getIssueStepPolicies(approvalIssue).map((policy, index) =>
      index === 0 ? { ...policy, risk: "approval" as const } : policy
    );
    render(
      <TroubleshootingGuide issue={approvalIssue} stepPolicies={policies} />
    );
    await waitFor(() =>
      expect(screen.getByText("Requires IT approval")).toBeInTheDocument()
    );
    expect(
      screen.getByRole("button", { name: "Ask IT to approve" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "I completed this step" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  test("denied steps are omitted while raw indexes remain available", async () => {
    const deniedIssue = ISSUES.find((item) => item.id === "no-sound")!;
    const policies = getIssueStepPolicies(deniedIssue).map((policy, index) =>
      index === 0 ? { ...policy, risk: "denied" as const } : policy
    );
    render(
      <TroubleshootingGuide issue={deniedIssue} stepPolicies={policies} />
    );
    await waitFor(() =>
      expect(screen.getByTestId("step-title")).toHaveTextContent(steps[1]!)
    );
    expect(screen.queryByText(steps[0]!)).not.toBeInTheDocument();
  });
});
