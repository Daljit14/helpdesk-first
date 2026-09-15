import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/app/actions/admin-resolution", () => ({
  pauseAiRun: vi.fn(),
  resumeAiRun: vi.fn(),
  takeOverRun: vi.fn(),
  escalateAiRun: vi.fn(),
}));

import { RunControls } from "./run-controls";

describe("RunControls", () => {
  test("disables every control for terminal runs", () => {
    render(<RunControls runId="run-1" status="resolved" canResume />);
    expect(screen.getByRole("button", { name: "Pause AI" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resume" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Take over" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Escalate" })).toBeDisabled();
  });
});
