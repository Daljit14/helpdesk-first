import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { EscalationPackageCard } from "./escalation-package";
import type { EscalationPackage } from "@/lib/investigation/escalation";

const pkg: EscalationPackage = {
  version: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  problem: {
    message: "The computer freezes.",
    issueTitle: "Computer freezing",
    issueSlug: "computer-freezing",
    category: "computer",
    priority: "High",
  },
  context: {
    platform: "Windows",
    requesterRole: "requester",
    attachmentCount: 1,
  },
  symptoms: ["Apps stop responding"],
  questionsAndAnswers: [],
  testsPerformed: [],
  stepsAttempted: [
    {
      guideSlug: "computer-freezing",
      stepIndex: 0,
      text: "Restart the app.",
      risk: "safe",
      outcome: "worked",
      at: "2026-01-01T00:00:00.000Z",
    },
  ],
  withheldSteps: [],
  likelyRootCause: {
    cause: "A frozen application",
    confidence: 0.9,
    evidence: ["Apps stop responding"],
  },
  otherHypotheses: [],
  aiConfidence: 0.9,
  sources: [],
  handoff: {
    reason: "Repeated failure",
    detail: null,
    at: "2026-01-01T00:00:00.000Z",
    failedAttempts: 2,
  },
  turns: 1,
};

afterEach(cleanup);

describe("EscalationPackageCard", () => {
  test("renders diagnosis details and outcome pills", () => {
    render(<EscalationPackageCard pkg={pkg} snapshotAt={null} />);

    expect(screen.getByLabelText("Diagnosis")).toBeInTheDocument();
    expect(screen.getByText("A frozen application")).toBeInTheDocument();
    expect(screen.getByText("worked")).toBeInTheDocument();
    expect(screen.getAllByText("None recorded").length).toBeGreaterThan(0);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  test("renders the snapshot state when present", () => {
    render(
      <EscalationPackageCard pkg={pkg} snapshotAt="2026-01-01T00:00:00.000Z" />
    );

    expect(screen.getByText(/Snapshot at/)).toBeInTheDocument();
  });
});
